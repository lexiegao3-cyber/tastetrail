import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rank} from '../app/rank.mjs';
const books=[{id:'a',title:'A',tags:['Nature'],minutes:100},{id:'b',title:'B',tags:['Mystery'],minutes:200}];
test('Genre preference outweighs time-only fit',()=>assert.equal(rank(books,['Nature'],200)[0].id,'a'));
test('Saved items are excluded',()=>assert.deepEqual(rank(books,[],200,['a','b']),[]));
test('Ranking preserves input and is deterministic',()=>{const original=JSON.stringify(books);assert.deepEqual(rank(books,[],100),rank(books,[],100));assert.equal(JSON.stringify(books),original)});

