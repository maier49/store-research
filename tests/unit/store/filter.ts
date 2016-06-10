import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';
import { filterFactory } from 'src/store/filter';
import { pathFactory } from '../../../src/patch/jsonPath';

type SimpleObj = { key: number; id: string };
type NestedObj = { key: { key2: number }; id: string};
type ListWithLists = { id: string, list: number[] };
const simpleList = [
	{
		key: 5,
		id: '1'
	},
	{
		key: 7,
		id: '2'
	},
	{
		key: 4,
		id: '3'
	}
];
const nestedList = [
	{
		key: {
			key2: 5
		},
		id: '1'
	},
	{
		key: {
			key2: 7
		},
		id: '2'
	},
	{
		key: {
			key2: 4
		},
		id: '3'
	}
];

const listWithLists = [
	{
		list: [ 1, 2, 3 ],
		id: '1'
	},
	{
		list: [ 3, 4, 5 ],
		id: '2'
	},
	{
		list: [ 4, 5, 6 ],
		id: '3'
	}
];
registerSuite({
	name: 'filter',

	'basic filter operations': {
		'with string path': {
			'less than': function() {
				assert.deepEqual(filterFactory<SimpleObj>().lessThan(5, 'key').apply(simpleList),
					[ { key: 4, id: '3' } ], 'Less than w/string path');
			},

			'less than or equal to': function() {
				assert.deepEqual(filterFactory<SimpleObj>().lessThanOrEqualTo(5, 'key').apply(simpleList),
					[ { key: 5, id: '1' }, { key: 4, id: '3' } ], 'Less than or equal to with string path');
			},

			'greater than': function() {
				assert.deepEqual(filterFactory<SimpleObj>().greaterThan(5, 'key').apply(simpleList),
					[ { key: 7, id: '2' } ], 'Greater than with string path');
			},

			'greater than or equal to': function() {
				assert.deepEqual(filterFactory<SimpleObj>().greaterThanOrEqualTo(5, 'key').apply(simpleList),
					[ { key: 5, id: '1' }, { key: 7, id: '2' } ], 'Greater than or equal to with string path');
			},

			'matches': function() {
				assert.deepEqual(filterFactory<SimpleObj>().matches(/[12]/, 'id').apply(simpleList),
					[ { key: 5, id: '1' }, { key: 7, id: '2' } ], 'Matches with string path');
			},

			'in': function() {
				assert.deepEqual(filterFactory<NestedObj>().in('key2', 'key').apply(nestedList),
					nestedList, 'In with string path');

				assert.deepEqual(filterFactory<NestedObj>().in('key1', 'key').apply(nestedList),
					[], 'In with string path');

				assert.deepEqual(filterFactory<ListWithLists>().in(4, 'list').apply(listWithLists),
					listWithLists.slice(1), 'In with string path');
			},

			'equalTo': function() {
				assert.deepEqual(filterFactory<SimpleObj>().equalTo(5, 'key').apply(simpleList),
					[ { key: 5, id: '1' } ], 'Equal to with string path');
			},

			'notEqualTo': function() {
				assert.deepEqual(filterFactory<SimpleObj>().notEqualTo(5, 'key').apply(simpleList),
					[ { key: 7, id: '2' }, { key: 4, id: '3' } ], 'Not equal to with string path');
			},

			'deepEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().deepEqualTo({ key2: 5 }, 'key').apply(nestedList),
					[ nestedList[0] ], 'Deep equal with string path');
			},

			'notDeepEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().notDeepEqualTo({ key2: 5 }, 'key').apply(nestedList),
					nestedList.slice(1), 'Not deep equal with string path')	;
			}
		},

		'with json path': {
			'less than': function() {
				assert.deepEqual(filterFactory<NestedObj>().lessThan(5, pathFactory('key', 'key2')).apply(nestedList),
					[ { key: { key2: 4 }, id: '3' } ], 'Less than with JSON path');
			},

			'less than or equal to': function() {
				assert.deepEqual(filterFactory<NestedObj>().lessThanOrEqualTo(5, pathFactory('key', 'key2')).apply(nestedList),
					[ { key: { key2: 5 }, id: '1' }, { key: { key2: 4 }, id: '3' } ], 'Less than or equal to with JSON path');
			},

			'greater than': function() {
				assert.deepEqual(filterFactory<NestedObj>().greaterThan(5, pathFactory('key', 'key2')).apply(nestedList),
					[ { key: { key2: 7 }, id: '2' } ], 'Greater than with JSON path');
			},

			'greater than or equal to': function() {
				assert.deepEqual(filterFactory<NestedObj>().greaterThanOrEqualTo(5, pathFactory('key', 'key2')).apply(nestedList),
				[ { key: { key2: 5 }, id: '1' }, { key: { key2: 7 }, id: '2' }], 'Greater than or equal to with JSON path');
			},

			'matches': function() {
				assert.deepEqual(filterFactory<NestedObj>().matches(/[12]/, pathFactory('id')).apply(nestedList),
				[ { key: { key2: 5 }, id: '1' }, { key: { key2: 7 }, id: '2' } ], 'Matches with JSON path');
			},

			'in': function() {
				assert.deepEqual(filterFactory<NestedObj>().in('key2', pathFactory('key')).apply(nestedList),
					nestedList, 'In with JSON path');

				assert.deepEqual(filterFactory<NestedObj>().in('key1', pathFactory('key')).apply(nestedList),
					[], 'In with JSON path');
			},

			'equalTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().equalTo(5, pathFactory('key', 'key2')).apply(nestedList),
					[{key: { key2: 5 }, id: '1'}], 'Equal to with json path');
			},

			'notEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().notEqualTo(5, pathFactory('key', 'key2')).apply(nestedList),
					[ { key: { key2: 7 }, id: '2' }, { key: { key2: 4 }, id: '3' } ], 'Not equal to with json path');
			},

			'deepEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().deepEqualTo(5, pathFactory('key', 'key2')).apply(nestedList),
					[ nestedList[0] ], 'Deep equal with JSON path');
			},

			'notDeepEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().notDeepEqualTo(5, pathFactory('key', 'key2')).apply(nestedList),
					nestedList.slice(1), 'Not deep equal with JSON path');
			}
		},

		'with no path': {

			'in': function() {
				assert.deepEqual(filterFactory<NestedObj>().in('key').apply(nestedList),
					nestedList, 'In without path');

				assert.deepEqual(filterFactory<NestedObj>().in('notAKey').apply(nestedList),
					[], 'In without path');

			},

			'equalTo': function() {
				assert.deepEqual(filterFactory<SimpleObj>().equalTo({ key: 5, id: '1'}).apply(simpleList),
					[], 'In without path');

				assert.deepEqual(filterFactory<SimpleObj>().equalTo(simpleList[0]).apply(simpleList),
					[ { key: 5, id: '1' } ], 'In without path');
			},

			'notEqualTo': function() {
				assert.deepEqual(filterFactory<NestedObj>().notEqualTo(nestedList[0]).apply(nestedList),
					nestedList.slice(1), 'Not equal to without path');
			},

			'deepEqualTo': function() {
				assert.deepEqual(filterFactory<SimpleObj>().deepEqualTo({ key: 5, id: '1'}).apply(simpleList),
					[ simpleList[0] ], 'Deep equal without path');
			},

			'notDeepEqualTo': function() {
				assert.deepEqual(filterFactory<SimpleObj>().notDeepEqualTo({ key: 5, id: '1'}).apply(simpleList),
					simpleList.slice(1), 'Not deep equal without path');
			}
		}

	},

	'compound filters': {
		'chained': {
			'automatic chaining': function() {
				assert.deepEqual(filterFactory<SimpleObj>().lessThanOrEqualTo(5, 'key').equalTo('1', 'id').apply(simpleList),
					[ simpleList[0] ], 'Sequential filters chain ands automatically');
			},

			'explicit chaining \'and\'': function() {
				assert.deepEqual(filterFactory<SimpleObj>().lessThanOrEqualTo(5, 'key').and().equalTo('1', 'id').apply(simpleList),
					[ simpleList[0] ], 'Chaining filters with and explicitly');
			},

			'explicit chaining \'or\'': function() {
				assert.deepEqual(filterFactory<SimpleObj>().lessThan(5, 'key').or().greaterThan(5, 'key').apply(simpleList),
					simpleList.slice(1), 'Chaining filters with or explicitly');
			},

			'combining \'and\' and \'or\'': function() {
				assert.deepEqual(filterFactory<SimpleObj>()
					// explicit chaining
					.equalTo(7, 'key')
					.and()
					.equalTo('2', 'id')
					.or()
					// implicit chaining
					.equalTo(4, 'key')
					.equalTo('3', 'id')
					.apply(simpleList),
					simpleList.slice(1), 'Chaining \'and\' and \'or\' filters');
			}
		},

		'nested'() {
			const pickFirstItem = filterFactory<NestedObj>()
				.lessThanOrEqualTo(5, pathFactory('key', 'key2'))
				.and()
				.equalTo('1', 'id')
				.or()
				.greaterThanOrEqualTo(5, pathFactory('key', 'key2'))
				.equalTo('1', 'id')
				.or()
				.greaterThan(5, pathFactory('key', 'key2'))
				.equalTo('1', 'id');
			const pickAllItems = filterFactory<NestedObj>().lessThan(100, pathFactory('key', 'key2'));
			const pickNoItems = filterFactory<NestedObj>().greaterThan(100, pathFactory('key', 'key2'));

			const pickLastItem = filterFactory<NestedObj>().equalTo('3', 'id');

			assert.deepEqual(pickFirstItem.apply(nestedList), [ nestedList[0] ], 'Should pick first item');
			assert.deepEqual(pickAllItems.apply(nestedList), nestedList, 'Should pick all items');
			assert.deepEqual(pickNoItems.apply(nestedList), [], 'Should pick no items');
			assert.deepEqual(pickLastItem.apply(nestedList), [ nestedList[2] ], 'Should pick last item');
			assert.deepEqual(pickFirstItem.and(pickLastItem).apply(nestedList), [], 'Shouldn\'t pick any items');
			assert.deepEqual(pickFirstItem.or(pickLastItem).apply(nestedList), [ nestedList[0], nestedList[2] ],
				'Should have picked first and last item');

			assert.deepEqual(pickFirstItem.or(pickAllItems.and(pickNoItems)).or(pickLastItem).apply(nestedList),
				[ nestedList[0], nestedList[2] ], 'Should have picked first and last item');
		}
	}
});
