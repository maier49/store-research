import { JsonPath, navigate, pathFactory } from '../patch/jsonPath';
import { isEqual } from '../utils';
import Query, { QueryType } from './query';

export type FilterFunction<T extends { id: string }> = (data: T[]) => T[];
export type ObjectPath = JsonPath | string;

export const enum FilterType {
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

export const enum BooleanOp {
	And,
	Or
}

export type FilterChainMember<T extends { id: string }> = (SimpleFilter<T> | BooleanOp);

export interface SimpleFilter<T extends { id: string }> extends Query<T> {
	type: FilterType;
	test?: (item: T) => boolean;
	toString(): string;
	filterChain?: FilterChainMember<T>[];
	path?: ObjectPath;
	value?: any;
}
export interface BooleanFilter<T extends { id: string }> extends SimpleFilter<T> {
	lessThan(value: number, path: ObjectPath): Filter<T>;
	lessThanOrEqualTo(value: number, path: ObjectPath): Filter<T>;
	greaterThan(value: number, path: ObjectPath): Filter<T>;
	greaterThanOrEqualTo(value: number, path: ObjectPath): Filter<T>;
	matches(test: RegExp, path: ObjectPath): Filter<T>;
	in<U>(value: U, path?: ObjectPath): Filter<T>;
	equalTo<U>(value: U, path?: ObjectPath): Filter<T>;
	deepEqualTo<U extends {}>(value: U, path?: ObjectPath): Filter<T>;
	deepEqualTo<U>(value: U[], path?: ObjectPath): Filter<T>;
	notEqualTo<U>(value: U, path?: ObjectPath): Filter<T>;
	notDeepEqualTo<U extends {}>(value: U, path?: ObjectPath): Filter<T>;
	notDeepEqualTo<U>(value: U[], path?: ObjectPath): Filter<T>;
	custom(test: (item: T) => boolean): Filter<T>;
}
export interface Filter<T extends { id: string }> extends BooleanFilter<T> {
	and(filter: Filter<T>): Filter<T>;
	and(): BooleanFilter<T>;
	or(filter: Filter<T>): Filter<T>;
	or(): BooleanFilter<T>;
}

function isFilter<T extends { id: string }>(filterOrFunction: FilterChainMember<T>): filterOrFunction is Filter<T> {
	return typeof filterOrFunction !== 'function'  && (<any> filterOrFunction).apply;
}

export function filterFactory<T extends { id: string }>(serializationStrategy?: (filter: Filter<T>) => string): Filter<T> {
	// var subFilters: NestedFilter<T> = subFilters || [];
	let filters: FilterChainMember<T>[] = [];
	serializationStrategy = serializationStrategy || serializeFilter;

	return filterFactoryHelper(filters, serializationStrategy);
}

function filterFactoryHelper<T extends { id: string }>(filters: FilterChainMember<T>[], serializationStrategy?: (filter: Filter<T>) => string): Filter<T> {
	// Small helpers to abstract common operations for building comparator filters
	// The main helper delegates to the factory, adding and AND operation before the next filter,
	// because by default each filter in a chain will be ANDed with the previous.
	function comparatorFilterHelper(filterType: FilterType, value: any, path?: ObjectPath): Filter<T> {
		return filterFactoryHelper(
			[ ...filters, BooleanOp.And, comparatorFactory<T>(filterType, value, path) ],
			serializationStrategy
		);
	}

	const filter: Filter<T> = {
		test: item => applyFilterChain(item, filters),
		type: FilterType.Compound,
		apply(data: T[]) {
			return data.filter(this.test);
		},
		toString() {
			return serializationStrategy(this);
		},
		and(newFilter?: Filter<T>) {
			let newFilters: FilterChainMember<T>[] = [];
			if (newFilter) {
				newFilters.push(this, BooleanOp.And, newFilter);
			} else if (filters.length) {
				newFilters.push(...filters, BooleanOp.And);
			}
			return filterFactoryHelper(newFilters, serializationStrategy);
		},
		or(newFilter?: Filter<T>) {
			let newFilters: FilterChainMember<T>[] = [];
			if (newFilter) {
				newFilters.push(this, BooleanOp.Or, newFilter);
			} else if (filters.length) {
				newFilters.push(...filters, BooleanOp.Or);
			}
			return filterFactoryHelper(newFilters, serializationStrategy);
		},
		lessThan: (value: number, path: ObjectPath) => comparatorFilterHelper(FilterType.LessThan, value, path),
		lessThanOrEqualTo: (value: number, path: ObjectPath) => comparatorFilterHelper(FilterType.LessThanOrEqualTo, value, path),
		greaterThan: (value: number, path: ObjectPath) => comparatorFilterHelper(FilterType.GreaterThan, value, path),
		greaterThanOrEqualTo: (value: number, path: ObjectPath) => comparatorFilterHelper(FilterType.GreaterThanOrEqualTo, value, path),
		matches: (value: RegExp, path: ObjectPath) => comparatorFilterHelper(FilterType.Matches, value, path),
		'in': (value: any, path?: ObjectPath) => comparatorFilterHelper(FilterType.In, value, path),
		equalTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(FilterType.EqualTo, value, path),
		deepEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(FilterType.DeepEqualTo, value, path),
		notEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(FilterType.NotEqualTo, value, path),
		notDeepEqualTo: (value: any, path?: ObjectPath) => comparatorFilterHelper(FilterType.NotDeepEqualTo, value, path),
		custom: (test: (item: T) => boolean) => comparatorFilterHelper(FilterType.Custom, test),
		queryType: QueryType.Filter
	};

	return filter;
}

function applyFilterChain<T extends { id: string }>(item: T, filterChain: FilterChainMember<T>[]): boolean {
	let ordFilterSections: FilterChainMember<T>[][] = [];
	let startOfSlice = 0;
	// Ands have higher precedence, so split into chains of
	// ands between ors.
	filterChain.forEach(function(chainMember, i) {
		if (chainMember === BooleanOp.Or) {
			ordFilterSections.push(filterChain.slice(startOfSlice, i));
			startOfSlice = i + 1;
		}
	});

	if (startOfSlice < filterChain.length) {
		ordFilterSections.push(filterChain.slice(startOfSlice, filterChain.length));
	}

	// These sections are or'd together so only
	// one has to pass
	return ordFilterSections.some(function(filterChain: FilterChainMember<T>[]) {
		// The individual filters are and'd together, so if any
		// fails the whole section fails
		return filterChain.every(function(filterOrAnd: FilterChainMember<T>) {
			if (isFilter(filterOrAnd)) {
				return filterOrAnd.test(item);
			} else {
				return true;
			}
		});
	});
}

function comparatorFactory<T extends { id: string }>(operator: FilterType, value: any, path?: ObjectPath): SimpleFilter<T> {
	path = typeof path === 'string' ? pathFactory(path) : path;
	let test: (property: any) => boolean;
	let type: FilterType;
	let toString: () => string;
	switch (operator) {
		case FilterType.LessThan:
			type = FilterType.LessThan;
			test = property => property < value;
			toString = () => `${path.toString()} <  ${value}`;
			break;
		case FilterType.LessThanOrEqualTo:
			type = FilterType.LessThanOrEqualTo;
			test = property => property <= value;
			toString = () => `${path.toString()} <= ${value}`;
			break;
		case FilterType.GreaterThan:
			type = FilterType.GreaterThan;
			test = property => property > value;
			toString = () => `${path.toString()} > ${value}`;
			break;
		case FilterType.GreaterThanOrEqualTo:
			type = FilterType.GreaterThanOrEqualTo;
			test = property => property >= value;
			toString = () => `${path.toString()} >= ${value}`;
			break;
		case FilterType.EqualTo:
			type = FilterType.EqualTo;
			test = property => property === value;
			toString = () => `${path ? path.toString() : 'this'} === ${value}`;
			break;
		case FilterType.NotEqualTo:
			type = FilterType.NotEqualTo;
			test = property => property !== value;
			toString = () => `${path ? path.toString() : 'this'} !== ${value}`;
			break;
		case FilterType.DeepEqualTo:
			type = FilterType.DeepEqualTo;
			test = property => isEqual(property, value);
			toString = () => `${path ? path.toString() : 'this'} == ${value}`;
			break;
		case FilterType.NotDeepEqualTo:
			type = FilterType.NotDeepEqualTo;
			test = property => !isEqual(property, value);
			toString = () => `${path ? path.toString() : 'this'} != ${value}`;
			break;
		case FilterType.In:
			type = FilterType.In;
			test = propertyOrItem => {
				if (Array.isArray(propertyOrItem)) {
					return propertyOrItem.indexOf(value) > -1;
				} else {
					return propertyOrItem && Boolean(propertyOrItem[value]);
				}
			};
			toString = () => `${value} in ${path ? path.toString() : 'this'}`;
			break;
		case FilterType.Matches:
			type = FilterType.Matches;
			test = property => value.test(property);
			toString = () => `${path.toString()} matches ${value}`;
			break;
		case FilterType.Custom:
			type = FilterType.Custom;
			test = value;
			toString = () => 'Cannot parse custom filter test';
			break;
		default:
			return null;
	}
	return {
		test: (item: T) => {
			let propertyValue: any = path ? navigate(<JsonPath> path, item) : item;
			return test(propertyValue);
		},
		apply: function(data: T[]) {
			return data.filter(this.test);
		},
		toString: toString,
		path: path,
		value: value,
		type: type,
		queryType: QueryType.Filter
	};
}

//// Default serialization function
function serializeFilter(filter: Filter<any>): string {
	if (filter.filterChain) {
		return filter.filterChain.reduce(function(prev: string, next: FilterChainMember<any>) {
			if (isFilter(next)) {
				return prev + '(' + next.toString() + ')';
			} else if (next === BooleanOp.And) {
				return prev + ' AND ';
			} else {
				return prev + ' OR ';
			}
		}, '');
	}
}
