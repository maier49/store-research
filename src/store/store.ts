import { Patch, PatchRecord, diff } from '../patch/Patch';

export interface Store<T extends { id: string }> {
	new (options?: { data?: T[] }): Store<T>;
	get(id: string): T;
	add(item: T): boolean;
	delete(id: string): boolean;
	update(callback: (data: T[]) => T[]): Patch;
	onUpdate(patch: PatchRecord);
	release();
	fetch(): T[];
}

export class MemoryStore<T> {
	private collection: T[];
	private sourceStore: Store<T>;
	private childStores: Array<Store<T>>;
	private map: { [ index: string ]: T };

	new (options?: { data? : T[], source?: Store<T> }) {
		options = options || {};
		this.collection = options.data || [];
		this.map = this.collection.map(function(item) {
			if (this.map[item.id]) {
				throw new Error('Collection contains item with duplicate ID');
			}
			this.map[item.id] = item;
		});
		this.sourceStore = options.source || null;
	}

	get(id: string) {
		return this.map[id];
	}

	add(item) {
		this.collection

		// TODO: perhaps a reviver function passed to 'fromJS' can handle id properties
		// named something other than 'id'
		this._collection = this._collection.push(immutable.fromJS(item));
	}

	put: function (item) {
		if (this._collection.has(item.id)) {
			// TODO: maybe use 'update' or 'merge' methods?
			this._collection = this._collection.set(item.id, item);
		}
		else {
			this._collection = this._collection.push(immutable.fromJS(item));
		}
	}

	delete: function (id) {
		this._collection = this._collection.delete(id);
	}
};

return MemoryStore;
});
