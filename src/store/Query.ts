import { JsonPath, navigate } from '../patch/jsonPath';

export type Filter<T extends { id: string }> = (data: T[]) => T[];
export interface SimpleQuery<T extends {id: string }> {
	apply: Filter;
}

export const enum FilterType {
	And,
	Or,
	LessThan,
	GreaterThan,
	EqualTo,
	In,
	NotEqualTo,
	LessThanOrEqualTo,
	GreaterThanOrEqualTo,
	Matches,
	Contains
}

export interface Query<T extends { id: string }> extends SimpleQuery<T>{
	and(query: Query<T>): Query<T>;
	or(query: Query<T>): Query<T>;
	toString(): string;
	lessThan(key: string, value: number),
	custom(test: (item: T) => boolean): Query<T>;
	type :
}

export interface

export function queryFactory<T>(serialization): Query<T> {
	var filters: Filter<T>[] = [];
	const query: Query<T> = {
		apply: (data: T[]) => queryFun(data),
		and(newQuery: Query<T>) {
			queryFun =  andFactory(queryFun, newQuery.apply);
			return query;
		},
		or(newQuery: Query<T>) {
			queryFun = orFactory(queryFun, newQuery.apply);
			return query;
		},
		custom(test: (item: T) => boolean) {
			queryFun = andFactory(queryFun, customFactory(test));
			return query;
		}
	};

	return query;
}

function andFactory<T>(a: Filter<T>, b: Filter<T>): Filter<T> {
	return (data: T[]) => {
		const ids:{ [ index:string ]:boolean } = {};
		a(data).forEach(item => ids[item.id] = true);
		return b(data).filter(item => ids[item.id]);
	};
}

function orFactory<T extends { id: string }>(a: Filter<T>, b: Filter<T>): Filter<T> {
	return (data: T[]) => {
		const fromA: T[] = [];
		const map:{ [ index:string ]:boolean } = {};

		a(data).forEach(item => {
			fromA.push(item);
			map[item.id] = true;
		});

		return <T[]> fromA.concat(b(data).filter(item => !(map[item.id])));
	};
}


function customFactory<T extends { id: string }>(test: (item: T) => boolean): Filter<T> {
	return (data: T[]) => data.filter(test);
}




