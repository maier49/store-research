import { isEqual } from '../utils';
import { JsonPointer, pathFactory } from './JsonPointer';
export const enum OperationType {
	Add,
	Remove,
	Replace,
	Copy,
	Move,
	Test
}

export interface Operation {
	op: string;
	path: JsonPointer;
	toString: () => string;
	apply: (target: any) => any;
}

export interface Add extends Operation {
	value: any;
}

function navigatePath(target: any, path: JsonPointer) {
	let currentPath = '';
	let lastSegment: string;
	const pathSegments = path.segments();
	pathSegments.forEach(
		(segment, index) => {
			currentPath += `/${segment}`;
			if (typeof target === 'undefined') {
				throw new Error(`Invalid path: ${currentPath} doesn't exist in target`);
			} else if (index + 1 < pathSegments.length) {
				target = target[segment];
			} else {
				lastSegment = segment;
			}
		}
	);

	return {
		object: target,
		property: lastSegment
	};
}

function add(target: any) {
	const applyTo = navigatePath(target, this.path);
	applyTo.object[applyTo.property] = this.value;

	return target;
}

function remove(target: any) {
	const applyTo = navigatePath(target, this.path);
	delete applyTo.object[applyTo.property];

	return target;
}

function replace(target: any) {
	const applyTo = navigatePath(target, this.path);
	if (typeof applyTo.object[applyTo.property] === 'undefined') {
		throw new Error(`Cannot replace undefined path: ${this.path.toString()} on object`);
	}
	applyTo.object[applyTo.property] = this.value;

	return target;
}

function copyOrMove(from: JsonPointer, to: JsonPointer, target: any, toDelete: boolean) {
	const moveFrom = navigatePath(target, from);
	if (typeof moveFrom.object[moveFrom.property] === 'undefined') {
		throw new Error(`Cannot move from undefined path: ${from.toString()} on object`);
	}

	const applyTo = navigatePath(target, to);

	applyTo.object[applyTo.property] = moveFrom.object[moveFrom.property];
	if (toDelete) {
		delete moveFrom.object[moveFrom.property];
	}

}

function move(target: any) {
	copyOrMove(this.from, this.path, target, true);
	return target;
}

function copy(target: any) {
	copyOrMove(this.from, this.path, target, false);
	return target;
}

function test(target: any) {
	const applyTo = navigatePath(target, this.path);
	return isEqual(applyTo.object[applyTo.property], this.value);
}

export interface Remove extends Operation {}

export interface Replace extends Operation {
	value: any;
	oldValue: any;
}

export interface Move extends Operation {
	from: JsonPointer;
}

export interface Copy extends Operation {
	from: JsonPointer;
}

export interface Test extends Operation {
	value: any;
}

function getPath(path: JsonPointer | string[]) {
	if (Array.isArray(path)) {
		return pathFactory(...path);
	} else {
		return path;
	}
}

function toString() {
	let jsonObj: any = {};
	jsonObj.op = this.op;
	jsonObj.path = this.path.toString();
	if (this.value) {
		jsonObj.value = this.value;
	}
	if (this.from) {
		jsonObj.from = this.from.toString();
	}

	return JSON.stringify(jsonObj);
}
export function operationFactory(type: OperationType, path: JsonPointer | string[], value?: any, from?: JsonPointer | string[], oldValue?: any): Operation {
	switch (type) {
		case OperationType.Add:
			return <Add> {
				op: 'add',
				path: getPath(path),
				value: value,
				apply: add,
				toString: toString
			};
		case OperationType.Remove:
			return <Remove> {
				op: 'remove',
				path: getPath(path),
				apply: remove,
				toString: toString
			};
		case OperationType.Replace:
			return <Replace> {
				op: 'replace',
				path: getPath(path),
				value: value,
				oldValue: oldValue,
				apply: replace,
				toString: toString
			};
		case OperationType.Move:
			if (!from) {
				throw new Error('From value is required for Move operations');
			}
			return <Move> {
				op: 'move',
				path: getPath(path),
				from: getPath(from),
				apply: move,
				toString: toString
			};
		case OperationType.Copy:
			if (!from) {
				throw new Error('From value is required in Copy operation');
			}
			return <Copy> {
				op: 'copy',
				path: getPath(path),
				from: getPath(from),
				apply: copy,
				toString: toString
			};
		case OperationType.Test:
			return <Test> {
				op: 'test',
				path: getPath(path),
				value: value,
				apply: test,
				toString: toString
			};
	}
}
