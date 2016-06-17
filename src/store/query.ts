interface Query<T extends { id: string }> {
	apply(data: T[]): T[];
	queryType: QueryType;
}

export const enum QueryType {
	Filter,
	Sort,
	Range
}

export default Query;
