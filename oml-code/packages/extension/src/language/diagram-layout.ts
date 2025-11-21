import type { LangiumSharedServices } from 'langium/lsp';
import type { SModelRoot } from 'sprotty-protocol';
import { URI } from 'langium';
import { DefaultLayoutConfigurator } from 'sprotty-elk/lib/elk-layout.js';
import { ElkLayoutEngine } from 'sprotty-elk/lib/elk-layout.js';
import type { ElkFactory } from 'sprotty-elk/lib/elk-layout.js';
import { computeDiagramModel, type DiagramModel, isVocabulary, isScalarProperty, isConcept, type Vocabulary, type ScalarProperty as AstScalarProperty } from 'oml-language';

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

// Build a map of concept name -> scalar property names (declared with that concept in their domain)
async function computeConceptScalarProps(shared: LangiumSharedServices, uri: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const docs = shared.workspace.LangiumDocuments;
  const document = await docs.getOrCreateDocument(URI.parse(uri));
  await shared.workspace.DocumentBuilder.build([document], { validation: false });

  const root: any = document.parseResult.value;
  if (isVocabulary(root)) {
    const vocab = root as Vocabulary;
    const scalarProps: AstScalarProperty[] = [] as any;
    for (const stmt of vocab.ownedStatements ?? []) {
      if (isScalarProperty(stmt)) scalarProps.push(stmt as any);
    }
    for (const sp of scalarProps) {
      const spName = (sp as any).name as string | undefined;
      if (!spName) continue;
      const ranges: string[] = ((sp as any).ranges ?? [])
        .map((r: any) => r?.ref?.name as string | undefined)
        .filter((n: string | undefined): n is string => !!n);
      const rangeText = ranges.length > 0 ? `: ${ranges.join(' | ')}` : '';
      const line = `${spName}${rangeText}`;

      const domains: any[] = (sp as any).domains ?? [];
      for (const d of domains) {
        const ent = d?.ref;
        if (ent && isConcept(ent) && ent.name) {
          const arr = map.get(ent.name) ?? [];
          if (!arr.includes(line)) arr.push(line);
          map.set(ent.name, arr);
        }
      }
    }
  }
  return map;
}

// Map our simple DiagramModel to a Sprotty SModelRoot suitable for ELK layout
function diagramToSprotty(model: DiagramModel, conceptProps?: Map<string, string[]>): SModelRoot {
  const nodeWidth = 120;
  const baseNodeHeight = 56;
  const lineHeight = 18;
  const nodes: any[] = [];
  const edges: any[] = [];

  // Create nodes with FREE port constraints
  model.nodes.forEach((n) => {
    if (n.kind !== 'relation') {
      const avgCharPx = 8;
      const paddingX = 32;
      const paddingY = 16;
  const header = n.label ?? n.id;

  // For concept nodes, append scalar properties (with ranges) below a divider.
  const props = n.kind === 'concept' ? (conceptProps?.get(n.id) ?? []) : [];
  const hasProps = props.length > 0;
  const lines: string[] = hasProps ? [header, ...props] : [header];

      const longest = lines.reduce((m, s) => Math.max(m, s.length), 0);
      const computedWidth = Math.max(nodeWidth, Math.min(600, paddingX + avgCharPx * longest));
  const labelBlockHeight = Math.max(20, lines.length * lineHeight);
      const computedHeight = Math.max(baseNodeHeight, paddingY + labelBlockHeight + 8);

      nodes.push({
        id: n.id,
        type: 'node:rect',
        size: { width: computedWidth, height: computedHeight },
        layoutOptions: {
          'org.eclipse.elk.portConstraints': 'FREE'
        },
        children: [
          {
            id: `${n.id}_label`,
            type: 'label:multiline',
            text: lines.join('\n'),
            splitIndex: hasProps ? 1 : 0, // draw divider after header when props exist
            layoutOptions: { 'org.eclipse.elk.labelSize': `${computedWidth - 20},${labelBlockHeight}` }
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
  const conceptProps = await computeConceptScalarProps(shared, uri);
  const root = diagramToSprotty(diagram, conceptProps);
  const laidOut = await layoutEngine.layout(root as any);
  return laidOut as unknown as SModelRoot;
}
