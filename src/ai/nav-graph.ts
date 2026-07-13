import type { Vec3 } from '../core/types';
import type { NavNode } from '../world/border-station-graybox';

const distance = (left: Vec3, right: Vec3): number => Math.hypot(
  left.x - right.x,
  left.y - right.y,
  left.z - right.z,
);

export class NavGraph {
  private readonly byId: Map<string, NavNode>;

  constructor(readonly nodes: NavNode[]) {
    this.byId = new Map(nodes.map((node) => [node.id, node]));
  }

  findPath(from: string, to: string): string[] {
    const start = this.requireNode(from);
    const goal = this.requireNode(to);
    const open = new Set([from]);
    const cameFrom = new Map<string, string>();
    const costs = new Map<string, number>([[from, 0]]);

    while (open.size > 0) {
      const current = [...open].sort((leftId, rightId) => {
        const left = this.requireNode(leftId);
        const right = this.requireNode(rightId);
        const leftScore = (costs.get(leftId) ?? Number.POSITIVE_INFINITY)
          + distance(left.position, goal.position);
        const rightScore = (costs.get(rightId) ?? Number.POSITIVE_INFINITY)
          + distance(right.position, goal.position);
        return leftScore - rightScore || leftId.localeCompare(rightId);
      })[0]!;

      if (current === to) return this.reconstruct(cameFrom, current);
      open.delete(current);

      const currentNode = this.requireNode(current);
      for (const neighborId of [...currentNode.neighbors].sort()) {
        const neighbor = this.requireNode(neighborId);
        const tentative = costs.get(current)! + distance(
          currentNode.position,
          neighbor.position,
        );
        const previous = costs.get(neighborId) ?? Number.POSITIVE_INFINITY;
        const previousParent = cameFrom.get(neighborId);
        if (tentative < previous
          || (tentative === previous && current < (previousParent ?? current))) {
          cameFrom.set(neighborId, current);
          costs.set(neighborId, tentative);
          open.add(neighborId);
        }
      }
    }

    return [];
  }

  nearest(position: Vec3, requiredTag?: string): NavNode {
    const candidates = this.nodes
      .filter((node) => requiredTag === undefined || node.tags.includes(requiredTag))
      .sort((left, right) => distance(left.position, position)
        - distance(right.position, position)
        || left.id.localeCompare(right.id));
    const nearest = candidates[0];
    if (!nearest) {
      throw new Error(requiredTag === undefined
        ? 'No nav nodes'
        : `No nav nodes match tag: ${requiredTag}`);
    }
    return nearest;
  }

  private requireNode(id: string): NavNode {
    const node = this.byId.get(id);
    if (!node) throw new Error(`Unknown nav node: ${id}`);
    return node;
  }

  private reconstruct(cameFrom: Map<string, string>, goal: string): string[] {
    const result = [goal];
    let current = goal;
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      result.push(current);
    }
    return result.reverse();
  }
}
