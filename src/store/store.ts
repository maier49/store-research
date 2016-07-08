import Query, { QueryType } from './Query';
import { PatchRecord, diff } from '../patch/Patch';
import {Filter, filterFactory} from './Filter';
// import { Sort } from './Sort';
import Promise from 'dojo-shim/Promise';
import { after } from 'dojo-compose/aspect';
import {Sort, sortFactory} from "./Sort";

export interface ItemAdded<T extends { id: string }> {
	item: T;
}

export interface ItemDeleted {
	id: string;
}

export type ItemMap<T extends { id: string }> = { [ index: string ]: { item: T, index: number } };
export type Update<T extends { id: string }> = ItemAdded<T> | ItemDeleted | PatchRecord;
export interface Subscriber<T extends { id: string }> {
	onUpdate(updates: Update<T>[]): void;
}

function isFilter<T extends { id: string }>(filterOrTest: Filter<T> | ((item: T) => boolean)): filterOrTest is Filter<T> {
	return typeof filterOrTest !== 'function';
}

function isSort<T extends { id: string }>(sortOrComparator: Sort<T> | ((a: T, b: T) => number)): sortOrComparator is Sort<T> {
	return typeof sortOrComparator !== 'function';
}

export interface Store<T extends { id: string }> extends Subscriber<T> {
	get(id: string): Promise<T>;
	add(item: T): Promise<T>;
	put(item: T): Promise<T>;
	delete(id: string): void;
	subscribe(subscriber: Subscriber<T>): { remove: () => void };
	unsubscribe(subscriber: Subscriber<T>): void;
	release(): void;
	fetch(): Promise<T[]>;
	filter(filter: Filter<T>): Store<T>;
	filter(test: (item: T) => boolean): Store<T>;
	version: number;
	sort(sort: Sort<T>, descending?: boolean): Store<T>;
	sort(comparator: (a: T, b: T) => number, descending?: boolean): Store<T>;
	range(range: Range): Store<T>;
	range(start: number, count: number): Store<T>;
}
export interface StoreOptions<T extends { id: string }> {
	source?: Store<T>;
	queries?: Query<T>[];
	version?: number;
}
export interface MemoryOptions<T extends { id: string }> extends StoreOptions<T> {
	data?: T[];
	map?: ItemMap<T>;
}

export abstract class BaseStore<T extends { id: string }> implements Store<T> {
	protected source: Store<T>;
	protected queries: Query<T>[];
	protected localData: T[];
	protected version: number;
	protected StoreClass: new (...args: any[]) => Store;
	protected subscribers: Subscriber[];
	constructor(options?: StoreOptions<T>) {
		options = options || {};
		this.source = options.source;
		this.version = options.version || 0;
		this.queries = options.queries ||[];
		this.StoreClass = <any> this.constructor;
		this.subscribers = [];

		if (this.source) {
			this.source.subscribe(this);
		}

		const store = this;
		this._put = after(this._put, function(itemPromise, ...args: any[]) {
			itemPromise.then(function(finalItem) {
				const oldItem: T = args[1];
				store.subscribers.forEach(function(subscriber) {
					subscriber.onUpdate([ { [finalItem.id]: diff(oldItem, finalItem) } ]);
				})
			});
		});
		
		this._add = after(this._add, function(itemPromise) {
			itemPromise.then(function(item) {
				store.subscribers.forEach(function(subscriber) {
					subscriber.onUpdate([ { item: item } ]);
				});
			});	
		});
		
		this._delete = after(this._delete, function(ignore, args: any[]) {
			const id = args[0];	
			store.subscribers.forEach(function(subscriber) {
				subscriber.onUpdate([ { id: id } ]);	
			});
		});
	}

	release() {
		if (this.source) {
			this.source.unsubscribe(this);
			this.fetch().then(function(data) {
				this.localData = data;
				this.queries = [];
				this.source = null;
			});
		}
	}

	get(id: string) {
		if (this.source) {
			return this.source.get(id);
		} else {
			return this._get(id);
		}
	}

	put(item: T) {
		this.version++;

		if (this.source) {
			return this.source.put(item);
		} else {
			return this.get(item.id).then(function(oldItem) {
				if (oldItem) {
					return this._put(item, oldItem);
				} else {
					return this._add(item);
				}
			});
		}
	}

	add(item: T) {
		this.version++;
		if (this.source) {
			return this.source.add(item)
		} else {
			return this._add(item);
		}
	}

	delete(id: string) {
		this.version++;
		if (this.source) {
			return this.source.delete(id);
		} else {
			return this._delete(id);
		}
	}

	filter(filterOrTest: Filter<T> | ((item: T) => boolean)) {
		const options: StoreOptions<T> = this._getOptions();
		if (isFilter(filterOrTest)) {
			options.queries = [ filterOrTest ];
		} else {
			options.queries = [ filterFactory().custom(filterOrTest) ];
		}

		return this._createSubcollection(options);
	}

	sort(sortOrComparator: Sort<T> | ((a: T, b: T) => number), descending?: boolean) {
		const options: StoreOptions<T> = this._getOptions();
		if (isSort(sortOrComparator)) {
			options.queries = [ sortOrComparator ];
		} else {
			options.queries = [ sortFactory(sortOrComparator, descending)]
		}
	},
	
	onUpdate(updates: Update[]) {
		this.subscribers.forEach(function(subscriber) {
			subscriber.onUpdate(updates);
		});
		
		this._handleUpdates(updates);
	}
	
	protected _createSubcollection(options: StoreOptions<T>) {
		return new this.StoreClass(options);
	}

	abstract fetch(): Promise<T[]>;
	protected abstract _get(id: string): T
	protected abstract _put(item: T, oldItem?: T);
	protected abstract _add(item: T);
	protected abstract _getOptions(): StoreOptions<T>;
	protected abstract _delete(id: string);
	protected abstract _handleUpdates(updates: Update[]);

	subscribe(subscriber: Subscriber<T>) {
		this.subscribers.push(subscriber);
		return {
			remove: () => {
				this.unsubscribe(subscriber);
			}
		};
	}

	unsubscribe(subscriber: Subscriber<T>) {
		const index = this.subscribers.indexOf(subscriber);
		if (index > -1) {
			this.subscribers.splice(index, 1);
		}
	}
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
	private collection: T[];
	private queriedCollection: T[];
	private queries: Query<T>[];
	private map: ItemMap<T>;
	private source: Store<T>;

	constructor(options?: MemoryOptions<T>) {
		this.collection = options.data || [];
		this.queries  = options.queries || [];
		this.map = options.map || this.buildMap(this.collection);
		this.source = options.source;
		this.version = options.version || 0;

		if (this.source) {
			this.source.subscribe(this);
		}
		this.subscribe(this);
	}

	release() {
		this.source.unsubscribe(this);
		this.fetch().then(function() {
			this.queries = this.queries.filter(function(query: Query<T>): boolean {
				return query.queryType === QueryType.Sort;
			});
			this.source = null;
		});
	}
	private buildMap(collection: T[], map?: ItemMap<T>): { [ index: string ]: { item: T, index: number } } {
		return collection.reduce(function(prev, next, index) {
			if (prev[next.id] && !map) {
				throw new Error('Collection contains item with duplicate ID');
			}
			prev[next.id] = { item: next, index: index };
			return prev;
		}, map || <ItemMap<T>> {});
	}

	get(id: string) {
		return Promise.resolve(this.map[id].item);
	}

	add(item: T) {
		this.version++;
		if (this.map[item.id]) {
			throw new Error('Item added to collection item with duplicate ID');
		}
		this.collection.push(item);
		this.map[item.id] = { item: item, index: this.collection.length - 1};

		this.subscribers.forEach((subscriber) => subscriber.onUpdate([ { item: item } ]));
		return Promise.resolve(item);
	}

	put(item: T) {
		this.version++;
		if (this.map[item.id]) {
			// TODO: maybe use 'update' or 'merge' methods?
			const mapEntry = this.map[item.id];
			const oldItem = mapEntry.item;
			this.collection[mapEntry.index] = mapEntry.item = item;

			const patchRecord: PatchRecord = { [item.id]:  diff(oldItem, item) };
			this.subscribers.forEach((subscriber) => subscriber.onUpdate([ patchRecord ]));
		} else {
			this.add(item);
		}

		return Promise.resolve(item);
	}

	delete(id: string): void {
		this.version++;
		const mapEntry = this.map[id];
		delete this.map[id];
		this.collection.splice(mapEntry.index, 1);
		this.buildMap(this.collection.slice(mapEntry.index), this.map);

		this.subscribers.forEach((subscriber) => subscriber.onUpdate([ { id: id } ]));
	}


	fetch() {
		if (this.source && this.version !== this.source.version) {
			this.queriedCollection = this.queries.reduce((prev, next) => next.apply(prev), this.collection);
			this.version = this.source.version;
		}
		return Promise.resolve(this.queriedCollection || this.collection);
	}


	onUpdate(updates: Update<T>[]) {
		// stub
	}
}
