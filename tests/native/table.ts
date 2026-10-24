import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { getSchema, mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import type { Node as ComarkNode } from 'comark';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, loadNativeBundles } from '../support/native';

interface NativeTableConverter {
  to: (cell: ComarkNode, type: string) => JSONContent;
  from: (cell: JSONContent, tag: string) => ComarkNode;
  cell: Node;
  header: Node;
  row: Node;
}

/** Exercise shipped converters through the actual TipTap schema's attribute filtering. */
function createTableRoundtrip(bundle: string): (cell: ComarkNode, edits?: Record<string, unknown>) => ComarkNode {
  const helpers = bundle.includes('function studioTableCellAlignment(')
    ? declaration(bundle, 'function studioTableCellAlignment(', 'function EEe(')
    : '';
  const converters = [
    declaration(bundle, 'function EEe(', 'function FEe('),
    declaration(bundle, 'function vEe(', 'function bEe('),
    declaration(bundle, 'function vMe(', 'function DMe('),
  ].join('\n');
  const native = runInNewContext(`${helpers}\n${converters}\n({to:EEe,from:vEe,cell:_Me,header:CMe,row:jMe});`, {
    Pse: Node,
    fre: mergeAttributes,
    SEe: new Set(['text', 'hardBreak', 'inline-element', 'span-style']),
    O_e: (node: ComarkNode) => typeof node === 'string' ? [] : node.slice(2),
    T_e: (node: ComarkNode) => typeof node === 'string' ? {} : node[1],
    _Ee: (node: ComarkNode) => {
      assert.equal(typeof node, 'string', 'Focused cell fixtures contain literal text only.');
      return { type: 'text', text: node };
    },
    uEe: (nodes: JSONContent[]) => nodes.map(node => node.type === 'text'
      ? node.text ?? ''
      : ['p', {}, ...(node.content ?? []).map(child => child.text ?? '')]),
  }, { timeout: 1000 }) as NativeTableConverter;
  const table = Node.create({ name: 'table', content: 'tableRow+' });
  const schema = getSchema([Document, Paragraph, Text, table, native.row, native.cell, native.header]);

  return (cell, edits = {}) => {
    assert.ok(Array.isArray(cell));
    const tag = cell[0];
    assert.ok(tag === 'th' || tag === 'td');
    const input = native.to(structuredClone(cell), tag === 'th' ? 'tableHeader' : 'tableCell');
    input.attrs = { ...input.attrs, ...edits };
    const document = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [input] }] }] });
    const mountedCell = document.firstChild?.firstChild?.firstChild;
    assert.ok(mountedCell);
    return JSON.parse(JSON.stringify(native.from(mountedCell.toJSON(), tag))) as ComarkNode;
  };
}

const { original, selected } = await loadNativeBundles();
const upstream = createTableRoundtrip(original);
const current = createTableRoundtrip(selected);
const aligned: ComarkNode = ['th', { align: 'right' }, 'Quantity'];
const lost: ComarkNode = ['th', {}, 'Quantity'];

assert.deepEqual(upstream(aligned), lost, 'Failure control: simply opening the upstream table drops authored alignment.');
assert.deepEqual(current(aligned), expectedFixed ? aligned : lost);

if (expectedFixed) {
  for (const tag of ['th', 'td']) {
    for (const align of ['left', 'center', 'right']) {
      const cell: ComarkNode = [tag, { align, class: 'metric-cell', style: 'color: red', 'data-example': 'synthetic' }, 'Value'];
      assert.deepEqual(current(cell), cell, 'An untouched cell retains its authored properties.');
    }
    assert.deepEqual(current([tag, {}]), [tag, {}], 'Empty cells remain valid schema nodes.');
  }
  assert.deepEqual(current(aligned, { align: 'left' }), ['th', { align: 'left' }, 'Quantity'], 'Intentional edits remain visible.');
  assert.deepEqual(current(aligned, { align: null }), lost, 'Clearing alignment remains a genuine edit.');
}

process.stdout.write(`${modeLabel}: actual table converters and TipTap schema ${expectedFixed ? 'preserve' : 'reproduce loss of'} alignment.\n`);
