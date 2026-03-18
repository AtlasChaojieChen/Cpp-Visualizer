import type { HeapBlockInfo } from '@/lib/cpp-engine';

interface TreeNode {
  address: number;
  value: any;
  left: number;
  right: number;
  label: string;
}

interface Props {
  heap: HeapBlockInfo[];
  pointerVars: { name: string; address: number }[];
}

function buildTreeNodes(heap: HeapBlockInfo[], pointerVars: { name: string; address: number }[]): TreeNode[] | null {
  const nodes: TreeNode[] = [];
  for (const block of heap) {
    if (block.freed) continue;
    const val = block.value;
    if (typeof val !== 'object' || val === null) continue;
    // Detect tree-like struct: has 'val'/'data'/'key' + 'left' + 'right'
    const keys = Object.keys(val);
    const hasLeft = keys.includes('left');
    const hasRight = keys.includes('right');
    const dataKey = keys.find(k => ['val', 'data', 'key', 'value'].includes(k));
    if (hasLeft && hasRight && dataKey) {
      const ptrVar = pointerVars.find(p => p.address === block.address);
      nodes.push({
        address: block.address,
        value: val[dataKey],
        left: val.left || 0,
        right: val.right || 0,
        label: ptrVar?.name || '',
      });
    }
  }
  if (nodes.length === 0) return null;
  return nodes;
}

function findRoot(nodes: TreeNode[]): TreeNode | null {
  const childAddrs = new Set<number>();
  for (const n of nodes) {
    if (n.left) childAddrs.add(n.left);
    if (n.right) childAddrs.add(n.right);
  }
  return nodes.find(n => !childAddrs.has(n.address)) || nodes[0];
}

interface LayoutNode {
  x: number;
  y: number;
  value: any;
  address: number;
  left?: LayoutNode;
  right?: LayoutNode;
}

function layoutTree(root: TreeNode, nodeMap: Map<number, TreeNode>, depth = 0, xRef = { val: 0 }): LayoutNode | null {
  if (!root) return null;
  const leftNode = root.left ? nodeMap.get(root.left) : null;
  const rightNode = root.right ? nodeMap.get(root.right) : null;

  const leftLayout = leftNode ? layoutTree(leftNode, nodeMap, depth + 1, xRef) : null;
  const x = xRef.val++;
  const rightLayout = rightNode ? layoutTree(rightNode, nodeMap, depth + 1, xRef) : null;

  return {
    x,
    y: depth,
    value: root.value,
    address: root.address,
    left: leftLayout || undefined,
    right: rightLayout || undefined,
  };
}

function renderNode(node: LayoutNode, offsetX: number, nodeSize: number, levelHeight: number, nodes: JSX.Element[], edges: JSX.Element[]) {
  const cx = node.x * (nodeSize + 16) + nodeSize / 2 + offsetX;
  const cy = node.y * levelHeight + nodeSize / 2 + 8;

  if (node.left) {
    const lcx = node.left.x * (nodeSize + 16) + nodeSize / 2 + offsetX;
    const lcy = node.left.y * levelHeight + nodeSize / 2 + 8;
    edges.push(
      <line key={`e-${node.address}-l`} x1={cx} y1={cy + 16} x2={lcx} y2={lcy - 16}
        stroke="hsl(250, 93%, 76%)" strokeWidth="2" strokeOpacity="0.4" />
    );
    renderNode(node.left, offsetX, nodeSize, levelHeight, nodes, edges);
  }
  if (node.right) {
    const rcx = node.right.x * (nodeSize + 16) + nodeSize / 2 + offsetX;
    const rcy = node.right.y * levelHeight + nodeSize / 2 + 8;
    edges.push(
      <line key={`e-${node.address}-r`} x1={cx} y1={cy + 16} x2={rcx} y2={rcy - 16}
        stroke="hsl(250, 93%, 76%)" strokeWidth="2" strokeOpacity="0.4" />
    );
    renderNode(node.right, offsetX, nodeSize, levelHeight, nodes, edges);
  }

  nodes.push(
    <g key={`n-${node.address}`}>
      <circle cx={cx} cy={cy} r={18} fill="hsla(250, 93%, 76%, 0.15)" stroke="hsl(250, 93%, 76%)" strokeWidth="2" />
      <text x={cx} y={cy + 5} textAnchor="middle" fill="hsl(226, 64%, 88%)" fontSize="13" fontFamily="monospace" fontWeight="600">
        {String(node.value)}
      </text>
    </g>
  );
}

function countNodes(node: LayoutNode): { width: number; depth: number } {
  if (!node) return { width: 0, depth: 0 };
  let maxX = node.x, minX = node.x, maxD = node.y;
  const traverse = (n: LayoutNode) => {
    maxX = Math.max(maxX, n.x);
    minX = Math.min(minX, n.x);
    maxD = Math.max(maxD, n.y);
    if (n.left) traverse(n.left);
    if (n.right) traverse(n.right);
  };
  traverse(node);
  return { width: maxX - minX + 1, depth: maxD + 1 };
}

export const TreeVisualizer = ({ heap, pointerVars }: Props) => {
  const treeNodes = buildTreeNodes(heap, pointerVars);
  if (!treeNodes) return null;

  const nodeMap = new Map(treeNodes.map(n => [n.address, n]));
  const root = findRoot(treeNodes);
  if (!root) return null;

  const layout = layoutTree(root, nodeMap);
  if (!layout) return null;

  const { width, depth } = countNodes(layout);
  const nodeSize = 36;
  const levelHeight = 60;
  const svgWidth = Math.max(width * (nodeSize + 16) + 40, 200);
  const svgHeight = depth * levelHeight + 40;

  const nodesEls: JSX.Element[] = [];
  const edgesEls: JSX.Element[] = [];
  renderNode(layout, 16, nodeSize, levelHeight, nodesEls, edgesEls);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-viz-purple flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-viz-purple" />
        Binary Tree
      </h3>
      <div className="overflow-x-auto rounded-lg border border-viz-purple/20 bg-viz-purple/[0.04] p-2">
        <svg width={svgWidth} height={svgHeight} className="mx-auto">
          {edgesEls}
          {nodesEls}
        </svg>
      </div>
    </div>
  );
};
