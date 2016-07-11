import Query from './Query';
import { Patch, diff } from '../patch/Patch';
import filterFactory, { Filter } from './Filter';
import Promise from 'dojo-shim/Promise';
import { after } from 'dojo-compose/aspect';
import request, { Response, RequestOptions } from	'dojo-core/request';
import { Sort, sortFactory } from './Sort';
import { StoreRange, rangeFactory } from './Range';
import {QueryType} from './Query';

export const enum UpdateType {
	Added,
	Updated,
	Deleted
}

export interface Update<T> {
	type: UpdateType;
}
export interface ItemAdded<T> extends Update<T> {
	item: T;
	index?: number;
}

export interface ItemUpdated<T> extends Update<T> {
	item: T;
	diff: () => Patch;
	index?: number;
	previousIndex?: number;
}

export interface ItemDeleted extends Update<any> {
	id: string;
	index?: number;
}

export type ItemMap<T> = { [ index: string ]: { item: T, index: number } };
export type SubscriberObj<T> = { onUpdate(updates: Update<T>[]): void}
export type Subscriber<T> = { onUpdate(updates: Update<T>[]): void; } | ((updates: Update<T>[]) => void);

function isFilter<T>(filterOrTest: Query<T> | ((item: T) => boolean)): filterOrTest is Filter<T> {
	return typeof filterOrTest !== 'function' && (<Query<T>> filterOrTest).queryType === QueryType.Filter;
}

function isSort<T>(sortOrComparator: Sort<T> | ((a: T, b: T) => number)): sortOrComparator is Sort<T> {
	return typeof sortOrComparator !== 'function';
}

function isSubscriberObj<T>(subscriber: Subscriber<T>): subscriber is SubscriberObj<T> {
	return Boolean((<any> subscriber).onUpdate);
}

export interface Store<T> {
	get(id: string): Promise<T>;
	getId(item: T): Promise<string>;
	generateId(): Promise<string>;
	add(item: T): Promise<T>;
	put(item: T): Promise<T>;
	put(id: string, patch: Patch): Promise<T>;
	delete(id: string): Promise<string>;
	subscribe(subscriber: Subscriber<T>): { remove: () => void };
	unsubscribe(subscriber: Subscriber<T>): void;
	release(): Promise<any>;
	fetch(): Promise<T[]>;
	filter(filter: Filter<T>): Store<T>;
	filter(test: (item: T) => boolean): Store<T>;
	createFilter(): Filter<T>;
	sort(sort: Sort<T> | ((a: T, b: T) => number) | string, descending?: boolean): Store<T>;
	range(range: StoreRange<T>): Store<T>;
	range(start: number, count: number): Store<T>;
}
export interface StoreOptions<T, U extends Store<T>> {
	source?: U;
	queries?: Query<T>[];
}
export interface MemoryOptions<T, U extends Store<T>> extends StoreOptions<T, U> {
	data?: T[];
	map?: ItemMap<T>;
	version?: number;
}

export interface RequestStoreOptions<T, U extends Store<T>> extends StoreOptions<T, U> {
	target: string;
	filterSerializer?: (filter: Filter<T>) => string;
	sendPatches?: boolean;
}

export abstract class BaseStore<T, U extends Store<T>> implements Store<T> {
	protected source: U;
	protected queries: Query<T>[];
	protected StoreClass: new (...args: any[]) => Store<T>;
	protected subscribers: Subscriber<T>[];
	protected getBeforePut: boolean;
	constructor(options?: StoreOptions<T, U>) {
		options = options || {};
		this.source = options.source;
		this.queries = options.queries || [];
		this.StoreClass = <any> this.constructor;
		this.subscribers = [];
		this.getBeforePut = true;

		const unwrapUpdate = function(updatePromise: Promise<Update<T>>) {
			updatePromise.then(this._handleUpdate.bind(this));
		}.bind(this);

		this._put = after(this._put, unwrapUpdate);
		this._add = after(this._add, unwrapUpdate);
		this._delete = after(this._delete, unwrapUpdate);
	}

	abstract fetch(): Promise<T[]>;
	abstract getId(item: T): Promise<string>;
	abstract generateId(): Promise<string>;
	abstract createFilter(): Filter<T>;

	protected abstract _get(id: string): Promise<T>
	protected abstract _put(itemOrId: T | String, patch?: Patch): Promise<ItemUpdated<T>>;
	protected abstract _add(item: T, index?: number): Promise<ItemAdded<T>>;
	protected abstract _getOptions(): StoreOptions<T, U>;
	protected abstract _delete(id: string, index?: number): Promise<ItemDeleted>;
	protected abstract _handleUpdate(update: Update<T>): void;
	protected abstract _isUpdate(item: T): Promise<boolean>;

	release(): Promise<any> {
		if (this.source) {
			this.subscribers.forEach(this.unsubscribe.bind(this));
			this.subscribers = [];
			return this.fetch().then(function() {
				this.source = null;
			}.bind(this));
		} else {
			return Promise.resolve();
		}
	}

	get(id: string) {
		if (this.source) {
			return this.source.get(id);
		} else {
			return this._get(id);
		}
	}

	put(itemOrId: T | string, patch?: Patch) {
		if (this.source) {
			return this.source.put((<any> itemOrId), patch);
		} else {
			const promise: Promise<any> = (patch ? Promise.resolve(patch) : this._isUpdate(<T> itemOrId));
			return promise.then(function(isUpdate: any) {
				if (isUpdate) {
					return this._put(itemOrId, patch).then(function(result: ItemUpdated<T>) {
						return result.item;
					});
				} else {
					return this._add(itemOrId).then(function(result: ItemAdded<T>) {
						return result.item;
					});
				}
			}.bind(this));
		}
	}

	add(item: T) {
		if (this.source) {
			return this.source.add(item);
		} else {
			return this._add(item).then(function(result) {
				return result.item;
			});
		}
	}

	delete(id: string) {
		if (this.source) {
			return this.source.delete(id);
		} else {
			return this._delete(id).then(function(result: ItemDeleted) {
				return result.id;
			});
		}
	}

	filter(filterOrTest: Filter<T> | ((item: T) => boolean)) {
		let filter: Filter<T>;
		if (isFilter(filterOrTest)) {
			filter = filterOrTest;
		} else {
			filter = this.createFilter().custom(filterOrTest);
		}

		return this._query(filter);
	}

	range(rangeOrStart: StoreRange<T> | number, count?: number) {
		let range: StoreRange<T>;
		if (typeof count !== 'undefined') {
			range = rangeFactory<T>(<number> rangeOrStart, count);
		} else {
			range = <StoreRange<T>> rangeOrStart;
		}

		return this._query(range);
	}

	sort(sortOrComparator: Sort<T> | ((a: T, b: T) => number), descending?: boolean) {
		let sort: Sort<T>;
		if (isSort(sortOrComparator)) {
			sort = sortOrComparator;
		} else {
			sort = sortFactory(sortOrComparator, descending);
		}

		return this._query(sort);
	}

	protected _query(query: Query<T>) {
		const options: StoreOptions<T, U> = this._getOptions();
		options.queries = [ ...(options.queries || []), query ];

		return this._createSubcollection(options);
	}

	protected _createSubcollection(options: StoreOptions<T, U>): U {
		return <U> new this.StoreClass(options);
	}

	subscribe(subscriber: Subscriber<T>) {
		this.subscribers.push();
		if (this.source) {
			const handle = this.source.subscribe(subscriber);
			return {
				remove: () => {
					handle.remove();
					this.unsubscribe(subscriber);
				}
			};
		} else {
			this.subscribers.push(subscriber);
			return {
				remove: () => {
					this.unsubscribe(subscriber);
				}
			};
		}
	}

	unsubscribe(subscriber: Subscriber<T>) {
		if (this.source) {
			this.source.unsubscribe(subscriber);
		} else {
			const index = this.subscribers.indexOf(subscriber);
			if (index > -1) {
				this.subscribers.splice(index, 1);
			}
		}
	}
}

export class MemoryStore<T> extends BaseStore<T, MemoryStore<T>> {
	private collection: T[];
	private queriedCollection: T[];
	private map: ItemMap<T>;
	private version: number;

	constructor(options?: MemoryOptions<T, MemoryStore<T>>) {
		super();
		this.collection = options.data || [];
		if (!this.source) {
			this.map = options.map || {};
			this.buildMap(this.collection, this.map);
		}
		this.version = options.version || 0;
	}

	release() {
		return super.release().then(function() {
			this.buildMap(this.collection);
		});
	}

	protected buildMap(collection: T[], map?: ItemMap<T>): Promise<{ [ index: string ]: { item: T, index: number } }> {
		const self = this;
		return collection.reduce(function(prev: Promise<ItemMap<T>>, next: T, index: number) {
			return self.getId(next).then(function(id) {
				return prev.then(function(prevMap: ItemMap<T>) {
					if (prevMap[id] && !map) {
						throw new Error('Collection contains item with duplicate ID');
					}
					prevMap[id] = { item: next, index: index };
					return prevMap;
				});
			});
		}, Promise.resolve(map || <ItemMap<T>> {}));
	}

	_get(id: string): Promise<T> {
		return Promise.resolve(this.map[id].item);
	}

	_put(itemOrId: T | string, patch?: Patch): Promise<ItemUpdated<T>> {
		this.version++;
		const idPromise = patch ? Promise.resolve(<string> itemOrId) : this.getId(<T> itemOrId);
		return idPromise.then(function(id) {
			const mapEntry = this.map[id];
			const oldItem: T = JSON.parse(JSON.stringify(mapEntry.item));
			const oldIndex: number = mapEntry.index;
			const item: T = patch ? patch.apply(mapEntry.item) : itemOrId;
			const _diff = () =>  patch ? patch : diff(oldItem, item);

			this.collection[mapEntry.index] = mapEntry.item = item;
			return Promise.resolve({
				item: item,
				oldItem: oldItem,
				oldIndex: oldIndex,
				diff: _diff,
				type: UpdateType.Updated
			});
		});
	}

	createFilter() {
		return filterFactory<T>();
	}

	getId(item: T) {
		return Promise.resolve((<any> item).id);
	}

	generateId() {
		return Promise.resolve('' + Math.random());
	}

	_add(item: T, index?: number): Promise<ItemAdded<T>> {
		this.version++;
		return this.getId(item).then(function(id) {
			if (this.map[id]) {
				throw new Error('Item added to collection item with duplicate ID');
			}
			this.collection.push(item);
			this.map[id] = { item: item, index: this.collection.length - 1};

			return {
				item: this.map[id].item,
				index: this.map[id].index,
				type: UpdateType.Added
			};
		});
	}

	_getOptions(): MemoryOptions<T, MemoryStore<T>> {
		return {
			version: this.version
		};
	}

	_delete(id: string, index?: number): Promise<ItemDeleted> {
		this.version++;
		const mapEntry = this.map[id];
		delete this.map[id];
		this.collection.splice(mapEntry.index, 1);
		this.buildMap(this.collection.slice(mapEntry.index), this.map);

		return Promise.resolve({
			id: id,
			index: mapEntry.index,
			type: UpdateType.Deleted
		});
	}

	_handleUpdate(update: Update<T>) {
		this.subscribers.forEach(function(subscriber) {
			if (isSubscriberObj(subscriber)) {
				subscriber.onUpdate([ update ]);
			} else {
				subscriber([ update ]);
			}
		});
	}

	_isUpdate(item: T) {
		return this.getId(item).then(function(id: string) {
			return this.map[id];
		}.bind(this));
	}

	fetch() {
		if (this.source && this.version !== this.source.version) {
			this.queriedCollection = this.queries.reduce((prev, next) => next.apply(prev), this.collection);
			this.version = this.source.version;
		}
		return Promise.resolve(this.queriedCollection || this.collection);
	}
}

export class RequestStore<T> extends BaseStore<T, RequestStore<T>> {
	private target: string;
	private filterSerializer: (filter: Filter<T>) => string;
	private sendPatches: boolean;

	constructor(options: RequestStoreOptions<T, RequestStore<T>>) {
		super();
		this.target = options.target;
		this.filterSerializer = options.filterSerializer;
		this.sendPatches = Boolean(options.sendPatches);
	}

	createFilter() {
		return filterFactory(this.filterSerializer);
	}

	fetch(): Promise<T[]> {
		const filterString = this.queries.reduce((prev: Filter<T>, next: Query<T>) => {
			if (isFilter(next)) {
				return prev ? prev.and(next) : next;
			} else {
				return prev;
			}
		}, null).toString();
		return request.get(this.target + '?' + filterString).then(function(response: Response<string>) {
			return JSON.parse(response.data);
		});
	}

	getId(item: T): Promise<string> {
		return Promise.resolve((<any> item).id);
	}

	generateId(): Promise<string> {
		return Promise.resolve('' + Math.random());
	}

	protected _get(id: string): Promise<T> {
		return Promise.resolve(null);
	}

	protected _put(itemOrId: String|T, patch?: Patch): Promise<ItemUpdated<T>> {
		let idPromise: Promise<string> = (patch ? Promise.resolve(<string> itemOrId) : this.getId(<T> itemOrId));
		return idPromise.then(function(id: string) {
			let requestOptions: RequestOptions;
			if (patch && this.sendPatches) {
				requestOptions = {
					method: 'patch',
					data: patch.toString(),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			} else {
				requestOptions = {
					method: 'put',
					data: JSON.stringify(itemOrId),
					headers: {
						'Content-Type': 'application/json'
					}
				};
			}
			return request<string>(this.target + id, requestOptions).then(function(response) {
				const item = JSON.parse(response.data);
				const oldItem: T = patch ? null : <T> itemOrId;
				return {
					item: item,
					type: UpdateType.Updated,
					diff: () => patch ? patch : diff(oldItem, item)
				};
			});
		}.bind(this));
	}

	protected _add(item: T, index?: number): Promise<ItemAdded<T>> {
		return request.post<string>(this.target, {
			data: JSON.stringify(item),
			headers: {
				'Content-Type': 'application/json'
			}
		}).then(function(response) {
			return {
				item: JSON.parse(response.data),
				type: UpdateType.Added
			};
		});
	}

	protected _getOptions(): RequestStoreOptions<T, RequestStore<T>> {
		return {
			target: this.target,
			filterSerializer: this.filterSerializer,
			sendPatches: this.sendPatches
		};
	}

	protected _delete(id: string, index?: number): Promise<ItemDeleted> {
		return  Promise.resolve({
			id: id,
			index: index,
			type: UpdateType.Deleted
		});
	}

	protected _handleUpdate(update: Update<T>): void {
	}

	protected _isUpdate(item: T): Promise<boolean> {
		return Promise.resolve(false);
	}

}
