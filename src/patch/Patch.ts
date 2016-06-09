import { shouldRecurseInto, isEqual } from '../utils';
import { OperationType, Operation, operationFactory } from './Operation';
import { JsonPath, pathFactory } from './JsonPath';
export interface Patch {
	operations: Operation[];
	apply: (target: any) => any;
	toString: () => String;
}

export type PatchRecord = { [ index: string ]: Patch };

function _diff(from: any, to: any, startingPath?: JsonPath): Operation[] {
	if (!shouldRecurseInto(from) || !shouldRecurseInto(to)) {
		return [];
	}
	startingPath = startingPath || pathFactory();
	const fromKeys = Object.keys(from);
	const toKeys = Object.keys(to);
	const operations: Operation[] = [];

	fromKeys.forEach((key) => {
		if (!isEqual(from[key], to[key])) {
			if (typeof from[key] !== 'undefined' && typeof to[key] === 'undefined') {
				operations.push(operationFactory(OperationType.Remove, startingPath.add(key)));
			} else if (shouldRecurseInto(from[key]) && shouldRecurseInto(to[key])) {
				operations.push(..._diff(from[key], to[key], startingPath.add(key)));
			} else {
				operations.push(operationFactory(OperationType.Replace, startingPath.add(key), to[key], null, from[key]));
			}
		}
	});

	toKeys.forEach((key) => {
		if (typeof from[key] === 'undefined' && typeof to[key] !== 'undefined') {
			operations.push(operationFactory(OperationType.Add, startingPath.add(key), to[key]));
		}
	});

	return operations;
}

export function diff(from: any, to: any): Patch {
	return {
		operations: _diff(from, to),
		apply: (target: any) => this.operations.reduce((prev: any, next: Operation) => next.apply(prev), target),
		toString() {
			return '[' + this.operations.reduce((prev: string, next: Operation) => {
				if (prev) {
					return prev + ',' + next.toString();
				} else {
					return next.toString();
				}
			}, '') + ']';
		}
	};
}

