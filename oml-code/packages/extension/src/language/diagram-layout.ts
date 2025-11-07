import type { LangiumSharedServices } from 'langium/lsp';
import type { SModelRoot } from 'sprotty-protocol';
import { DefaultLayoutConfigurator } from 'sprotty-elk/lib/elk-layout.js';
import { ElkLayoutEngine } from 'sprotty-elk/lib/elk-layout.js';
import type { ElkFactory } from 'sprotty-elk/lib/elk-layout.js';
import { computeDiagramModel, type DiagramModel } from 'oml-language';

// Prepare an Elk factory usable in the CJS-bundled extension host.
const elkFactory: ElkFactory = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ElkModule = require('elkjs/lib/elk.bundled.js');
  const ElkCtor: any = ElkModule.default ?? ElkModule;
  return new ElkCtor({ algorithms: ['layered'] });
};

class OmlLayoutConfigurator extends DefaultLayoutConfigurator {
  protected override graphOptions(): Record<string, string> | undefined {
    return {
      'org.eclipse.elk.direction': 'UP',
      'org.eclipse.elk.edgeRouting': 'POLYLINE',
      'org.eclipse.elk.layered.edgeRouting': 'POLYLINE',
      'org.eclipse.elk.layered.layering.strategy': 'LONGEST_PATH',
      'org.eclipse.elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      // Center nodes horizontally within each layer
      'org.eclipse.elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment': 'CENTER',
      'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'org.eclipse.elk.layered.considerModelOrder.strategy': 'PREFER_NODES',
      // Spacing
      'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'org.eclipse.elk.spacing.nodeNode': '28',
      'org.eclipse.elk.spacing.edgeNode': '24',
      'org.eclipse.elk.spacing.edgeEdge': '18',
      'org.eclipse.elk.spacing.portPort': '12',
      // Do not merge parallel edges; allow ELK to route them separately (fan-out)
      'org.eclipse.elk.layered.mergeEdges': 'false',
      // Keep edge groups separate during crossing minimization to preserve distinct routes
      'org.eclipse.elk.layered.crossingMinimization.separateEdgeGroups': 'true'
    };
  }
  protected override labelOptions(): Record<string, string> | undefined {
    return {
      'org.eclipse.elk.nodeLabels.placement': 'INSIDE, H_CENTER, V_CENTER'
    };
  }
}

const layoutEngine = new ElkLayoutEngine(elkFactory, undefined as any, new OmlLayoutConfigurator());

// Map our simple DiagramModel to a Sprotty SModelRoot suitable for ELK layout
function diagramToSprotty(model: DiagramModel): SModelRoot {
  const nodeWidth = 120;
  const nodeHeight = 56;
  const nodes: any[] = [];
  const edges: any[] = [];

  // Create nodes with FREE port constraints
  model.nodes.forEach((n) => {
    if (n.kind !== 'relation') {
      const avgCharPx = 8;
      const paddingX = 32;
      const labelText = n.label ?? n.id;
      const computedWidth = Math.max(nodeWidth, Math.min(600, paddingX + avgCharPx * labelText.length));

      nodes.push({
        id: n.id,
        type: 'node:rect',
        size: { width: computedWidth, height: nodeHeight },
        layoutOptions: {
          'org.eclipse.elk.portConstraints': 'FREE'  // Changed to FREE
        },
        children: [
          {
            id: `${n.id}_label`,
            type: 'label',
            text: n.label,
            layoutOptions: { 'org.eclipse.elk.labelSize': `${computedWidth - 20},20` }
          }
        ]
      });
    }
  });

  model.edges.forEach((e) => {
    const isSpec = e.kind === 'specialization';
    edges.push({
      id: e.id,
      type: 'edge',
      kind: e.kind,
      hasMarker: e.hasMarker,
      sourceId: e.source,
      targetId: e.target,
      layoutOptions: isSpec
        ? {
          'org.eclipse.elk.edge.type': 'GENERALIZATION',
          'org.eclipse.elk.port.side': 'NORTH',  // For source
          'org.eclipse.elk.port.borderOffset': '0',
          'org.eclipse.elk.layered.priority.direction': '100',
          'org.eclipse.elk.layered.priority.straightness': '100'
        }
        : {
          'org.eclipse.elk.edge.type': 'ASSOCIATION',
          'org.eclipse.elk.edge.routing': 'POLYLINE',
          'org.eclipse.elk.edge.source.side': 'WEST',
          'org.eclipse.elk.edge.target.side': 'WEST',
          'org.eclipse.elk.layered.priority.direction': '0',
          'org.eclipse.elk.layered.priority.straightness': '0'
        },
      children: e.label
        ? [{ id: `${e.id}_label`, type: 'label', text: e.label, layoutOptions: { 'org.eclipse.elk.labelSize': '60,14' } }]
        : []
    });
  });

  return {
    id: 'root',
    type: 'graph',
    layoutOptions: {
      'org.eclipse.elk.algorithm': 'org.eclipse.elk.layered',
      'org.eclipse.elk.direction': 'UP'
    },
    children: [...nodes, ...edges]
  } as unknown as SModelRoot;
}

export async function computeLaidOutSModelForUri(shared: LangiumSharedServices, uri: string): Promise<SModelRoot> {
  const diagram = await computeDiagramModel(shared, uri);
  const root = diagramToSprotty(diagram);
  const laidOut = await layoutEngine.layout(root as any);
  return laidOut as unknown as SModelRoot;
}
