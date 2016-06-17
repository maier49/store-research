import Query, { QueryType } from './Query';

export interface Sort<T extends { id: string }> extends Query<T> {}

export function sortFactory<T extends { id: string }>(comparator: (a: T, b: T) => number): Sort<T> {
	return {
		apply: (data: T[]) => data.sort(comparator),
		queryType: QueryType.Sort
	};
}
