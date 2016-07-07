import Query, { QueryType } from './Query';
import { PatchRecord, diff } from '../patch/Patch';
import {Filter, filterFactory} from './Filter';
// import { Sort } from './Sort';
import { Promise } from 'es6-promise';

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

// function isSort<T extends { id: string }>(sortOrComparator: Sort<T> | ((a: T, b: T) => number)): sortOrComparator is Sort<T> {
// 	return typeof sortOrComparator !== 'function';
// }

export interface Store<T extends { id: string }> extends Subscriber<T> {
	get(id: string): Promise<T>;
	add(item: T): Promise<T>;
	put(item: T): Promise<T>;
	delete(id: string): void;
	subscribe(subscriber: Subscriber<T>): () => void ;
	unsubscribe(subscriber: Subscriber<T>): void;
	release(): void;
	fetch(): Promise<T[]>;
	filter(filter: Filter<T>): Store<T>;
	filter(test: (item: T) => boolean): Store<T>;
	// sort(sort: Sort<T>): Store<T>;
	// sort(comparator: (a: T, b: T) => number): Store<T>;
	// range(range: Range): Store<T>;
	// range(start: number, count: number): Store<T>;
}

export interface MemoryOptions<T extends { id: string }> {
	data?: T[];
	source?: Store<T>;
	queries?: Query<T>[];
	map?: ItemMap<T>;
}

export class MemoryStore<T extends { id: string }> implements Store<T> {
	private collection: T[];
	private queriedCollection: T[];
	private queries: Query<T>[];
	private	subscribers: Subscriber<T>[];
	private map: ItemMap<T>;
	private source: Store<T>;

	constructor(options?: MemoryOptions<T>) {
		this.collection = options.data || [];
		this.queries  = options.queries || [];
		this.map = options.map || this.buildMap(this.collection);
		this.source = options.source;

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
		if (this.map[item.id]) {
			throw new Error('Item added to collection item with duplicate ID');
		}
		this.collection.push(item);
		this.map[item.id] = { item: item, index: this.collection.length - 1};

		this.subscribers.forEach((subscriber) => subscriber.onUpdate([ { item: item } ]));
		return Promise.resolve(item);
	}

	put(item: T) {
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
		const mapEntry = this.map[id];
		delete this.map[id];
		this.collection.splice(mapEntry.index, 1);
		this.buildMap()

		this.subscribers.forEach((subscriber) => subscriber.onUpdate([ { id: id } ]));
	}

	subscribe(subscriber: Subscriber<T>) {
		this.subscribers.push(subscriber);
		return () => this.subscribers.splice(this.subscribers.indexOf(subscriber), 1);
	}

	unsubscribe(subscriber: Subscriber<T>) {
		this.subscribers.splice(this.subscribers.indexOf(subscriber), 1);
	}

	fetch() {
		this.queriedCollection = this.queriedCollection ||
			this.queries.reduce((prev, next) => next.apply(prev), this.collection);
		return Promise.resolve(this.queriedCollection);
	}

	filter(filterOrTest: Filter<T> | ((item: T) => boolean)) {
		if (isFilter(filterOrTest)) {
			return new MemoryStore({
				data: this.collection,
				queries: [ ...this.queries, filterOrTest ],
				map: this.map
			});
		} else {
			return new MemoryStore({
				data: this.collection,
				queries: [ ...this.queries, filterFactory().custom(filterOrTest) ],
				map: this.map
			});
		}
	}

	onUpdate(updates: Update<T>[]) {
		// stub
	}
}

