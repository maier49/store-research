import Query, { QueryType } from './query';
export interface Range<T extends { id: string }> extends Query<T> {}

export function rangeFactory<T extends { id: string }>(start: number, count: number): Range<T> {
	return {
		apply: (data: T[]) => data.slice(start, start + count),
		queryType: QueryType.Range
	};
}
