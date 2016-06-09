import { JsonPath, navigate, pathFactory } from '../patch/jsonPath';
import { isEqual } from '../utils';

export type FilterFunction<T extends { id: string }> = (data: T[]) => T[];
export type ObjectPath = JsonPath | string;

export const enum FilterType {
	And,
	Or,
	LessThan,
	GreaterThan,
	EqualTo,
	DeepEqualTo,
	In,
	NotEqualTo,
	NotDeepEqualTo,
	LessThanOrEqualTo,
	GreaterThanOrEqualTo,
	Matches,
	Custom,
	Compound
}

export type FilterChainMember<T extends { id: string }> = (FilterFunction<T> | Filter<T> | FilterType);

export interface Filter<T extends { id: string }> {
	type: FilterType;
	apply: FilterFunction<T>;
	toString(): string;
	and(filter: Filter<T>): Filter<T>;
	or(filter: Filter<T>): Filter<T>;
	lessThan(path: ObjectPath, value: number): Filter<T>;
	lessThanOrEqualTo(path: ObjectPath, value: number): Filter<T>;
	greaterThan(path: ObjectPath, value: number): Filter<T>;
	greaterThanOrEqualTo(path: ObjectPath, value: number): Filter<T>;
	matches(path: ObjectPath, test: RegExp): Filter<T>;
	in<U>(value: U, path?: ObjectPath): Filter<T>;
	equalTo<U>(value: U, path?: ObjectPath): Filter<T>;
	deepEqualTo<U extends {}>(value: U, path?: ObjectPath): Filter<T>;
	deepEqualTo<U>(value: U[], path?: ObjectPath): Filter<T>;
	notEqualTo<U>(value: U, path?: ObjectPath): Filter<T>;
	notDeepEqualTo<U extends {}>(value: U, path?: ObjectPath): Filter<T>;
	notDeepEqualTo<U>(value: U[], path?: ObjectPath): Filter<T>;
	custom(test: (item: T) => boolean): Filter<T>;
}

function isFilterFunction<T extends { id: string }>(filterOrFunction: FilterChainMember<T>): filterOrFunction is FilterFunction<T> {
	return typeof filterOrFunction === 'function';
}

function isFilter<T extends { id: string }>(filterOrFunction: FilterChainMember<T>): filterOrFunction is Filter<T> {
	return typeof filterOrFunction !== 'function'  && (<any> filterOrFunction).apply;
}

function getFilterFunction<T extends { id: string }>(filterOrFunction: FilterChainMember<T>): FilterFunction<T> {
	if (isFilter(filterOrFunction)) {
		return filterOrFunction.apply;
	} else if (isFilterFunction(filterOrFunction)) {
		return filterOrFunction;
	} else {
		return null;
	}
}

export function filterFactory<T extends { id: string }>(serializationStrategy?: (filter: Filter<T>) => (string)): Filter<T> {
	// var subFilters: NestedFilter<T> = subFilters || [];
	const filters: FilterChainMember<T>[] = [];

	// Small helpers to abstract common operations for building comparator filters
	// The main helper delegates to the factory, adding and AND operation before the next filter,
	// because by default each filter in a chain will be ANDed with the previous.
	function comparatorFilterHelper(filter: Filter<T>, filterType: FilterType, value: any, path?: ObjectPath): Filter<T> {
		filters.push(FilterType.And);
		filters.push(comparatorFactory<T>(filterType, value, path));
		return filter;
	}

	const filter: Filter<T> = {
		type: FilterType.Compound,
		apply: (data: T[]) => (compressFilters(filters))(data),
		toString() {
			return (serializationStrategy || serializeFilter)(this);
		},
		and(newFilter: Filter<T>) {
			filters.push(FilterType.And, newFilter);
			return filter;
		},
		or(newFilter: Filter<T>) {
			filters.push(FilterType.Or, newFilter);
			return filter;
		},
		lessThan: (path: ObjectPath, value: number) => comparatorFilterHelper(filter, FilterType.LessThan, value, path),
		lessThanOrEqualTo: (path: ObjectPath, value: number) => comparatorFilterHelper(filter, FilterType.LessThanOrEqualTo, value, path),
		greaterThan: (path: ObjectPath, value: number) => comparatorFilterHelper(filter, FilterType.GreaterThan, value, path),
		greaterThanOrEqualTo: (path: ObjectPath, value: number) => comparatorFilterHelper(filter, FilterType.GreaterThanOrEqualTo, value, path),
		matches: (path: ObjectPath, value: RegExp) => comparatorFilterHelper(filter, FilterType.Matches, value, path),
		'in': (value: any, path?: ObjectPath) => comparatorFilterHelper(filter, FilterType.In, value, path),
		equalTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(filter, FilterType.EqualTo, value, path),
		deepEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(filter, FilterType.EqualTo, value, path),
		notEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(filter, FilterType.NotEqualTo, value, path),
		notDeepEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(filter, FilterType.NotDeepEqualTo, value, path),
		custom: (test: (item: T) => boolean) => comparatorFilterHelper(filter, FilterType.Custom, test)
	};

	return filter;
}

function compressFilters<T extends { id: string }>(filters: FilterChainMember<T>[]): FilterFunction<T> {
	return compressOrFilters(compressAndFilters(filters));
}

function compressAndFilters<T extends { id: string }>(filters: FilterChainMember<T>[]): FilterChainMember<T>[] {
	let newFilters: FilterChainMember<T>[] = [];
	filters.reduce((prev: FilterFunction<T>, next: FilterChainMember<T>) => {
		if (!prev) {
			return getFilterFunction(next);
		} else if (next === FilterType.Or) {
			if (prev) {
				newFilters.push(prev);
			}
			newFilters.push(next);
			return null;
		} else if (next !== FilterType.And) {
			if (isFilter(next)) {
				newFilters.push(andFactory(prev, next.apply));
			} else if (isFilterFunction(next)) {
				newFilters.push(andFactory(prev, next));
			}
			return null;
		} else {
			// Ands are essentially noops because we already have the previous and we're not including them in the new
			// set
			return prev;
		}
	}, null);

	return newFilters;
}

function compressOrFilters<T extends { id: string }>(filters: FilterChainMember<T>[]): FilterFunction<T> {
	return getFilterFunction(filters.reduce((prev: FilterFunction<T>, next: FilterChainMember<T>) => {
		if (!prev) {
			return getFilterFunction(next);
		} else if (next === FilterType.Or) {
			return prev;
		} else {
			if (isFilter(next)) {
				return orFactory(prev, next.apply);
			} else if (isFilterFunction(next)) {
				return orFactory(prev, next);
			} else {
				return prev;
			}
		}
	}, null));
}

function andFactory<T extends { id: string }>(a: FilterFunction<T>, b: FilterFunction<T>): FilterFunction<T> {
	return (data: T[]) => {
		const ids: { [ index: string ]: boolean } = {};
		a(data).forEach(item => ids[item.id] = true);
		return b(data).filter(item => ids[item.id]);
	};
}

function orFactory<T extends { id: string }>(a: FilterFunction<T>, b: FilterFunction<T>): FilterFunction<T> {
	return (data: T[]) => {
		const fromA: T[] = [];
		const map: { [ index: string ]: boolean } = {};

		a(data).forEach(item => {
			fromA.push(item);
			map[item.id] = true;
		});

		return <T[]> fromA.concat(b(data).filter(item => !(map[item.id])));
	};
}

function comparatorFactory<T extends { id: string }>(operator: FilterType, value: any, path?: ObjectPath): FilterFunction<T> {
	path = typeof path === 'string' ? pathFactory(path) : path;
	let test: (property: any) => boolean;
	switch (operator) {
		case FilterType.LessThan:
			test = property => property < value;
			break;
		case FilterType.LessThanOrEqualTo:
			test = property => property <= value;
			break;
		case FilterType.GreaterThan:
			test = property => property > value;
			break;
		case FilterType.GreaterThanOrEqualTo:
			test = property => property >= value;
			break;
		case FilterType.EqualTo:
			test = property => property === value;
			break;
		case FilterType.NotEqualTo:
			test = property => property !== value;
			break;
		case FilterType.DeepEqualTo:
			test = property => isEqual(property, value);
			break;
		case FilterType.NotDeepEqualTo:
			test = property => !isEqual(property, value);
			break;
		case FilterType.In:
			test = propertyOrItem => {
				if (Array.isArray(propertyOrItem)) {
					return propertyOrItem.indexOf(value) > -1;
				} else {
					return propertyOrItem && Boolean(propertyOrItem[value]);
				}
			};
			break;
		case FilterType.Matches:
			test = property => value.test(property);
			break;
		case FilterType.Custom:
			test = value;
			break;
		default:
			test = anything => true;
			break;
	}
	return (data: T[]) => data.filter((item: T) => {
		let propertyValue: any = path ? navigate(<JsonPath> path, item) : item;
		return test(propertyValue);
	});
}

//// Default serialization function
function serializeFilter(filter: Filter<any>): string {
	return '';
}
