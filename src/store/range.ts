import Query, { QueryType } from './query';
export interface Range<T extends { id: string }> extends Query<T> {
	start: number;
	count: number;
}

export function rangeFactory<T extends { id: string }>(start: number, count: number, serializer?: (range: Range<T>) => string): Range<T> {
	return {
		apply: (data: T[]) => data.slice(start, start + count),
		queryType: QueryType.Range,
		toString() {
			return (serializer || serializeRange)(this);
		},
		start: start,
		count: count
	};
}

function serializeRange(range: Range<any>): string {
	return `range(${range.start}, ${range.count})`;
}
