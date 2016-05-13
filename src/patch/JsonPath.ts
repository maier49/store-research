export interface JsonPath {
	segments: () => string[];
	toString: () => string;
	add: (segment: String) => JsonPath;
}

function decode(segment: string) {
	return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function encode(segment: string) {
	return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function toString(...segments: string[]): string {
	return segments.reduce((prev, next) => prev + '/' + encode(next));
}

export function pathFactory(...segments: string[]): JsonPath {
	return {
		segments: () => segments.map(segment => decode(segment)),
		toString: () => toString(...segments),
		add: (segment: string) => pathFactory(...segments.concat(segment))
	};
}
