import { URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import {
    isVocabulary,
    isConcept,
    isAspect,
    isRelationEntity,
    isUnreifiedRelation
} from './generated/ast.js';

export type DiagramNode = {
    id: string;
    label: string;
    kind: 'concept' | 'aspect' | 'relation-entity' | 'relation'; // 'relation-entity' is a node, 'relation' is just for edges
};

export type DiagramEdge = {
    id: string;
    source: string;
    target: string;
    kind: 'specialization' | 'relation';
    label?: string;
    hasMarker?: boolean; // false means no marker, true means relation arrow (for relation entity edges)
};

export type DiagramModel = { nodes: DiagramNode[]; edges: DiagramEdge[] };

/**
 * Compute a simple diagram model for the OML document at the given URI.
 * - Nodes: Concepts, Aspects, RelationEntities and UnreifiedRelations (as relation nodes)
 * - Edges: Specialization (child -> super) and relation (source -> target) edges
 */
export async function computeDiagramModel(shared: LangiumSharedServices, uri: string): Promise<DiagramModel> {
    const langiumDocs = shared.workspace.LangiumDocuments;
    const document = await langiumDocs.getOrCreateDocument(URI.parse(uri));
    // Ensure the document is built/linked
    await shared.workspace.DocumentBuilder.build([document], { validation: false });

    const root: any = document.parseResult.value;
    const nodes: DiagramNode[] = [];
    const edges: DiagramEdge[] = [];

    if (isVocabulary(root)) {
        const termByName = new Map<string, any>();
        for (const stmt of root.ownedStatements ?? []) {
            if (isConcept(stmt) && stmt.name) {
                termByName.set(stmt.name, stmt);
                nodes.push({ id: stmt.name, label: stmt.name, kind: 'concept' });
            } else if (isAspect(stmt) && stmt.name) {
                termByName.set(stmt.name, stmt);
                nodes.push({ id: stmt.name, label: stmt.name, kind: 'aspect' });
            } else if (isRelationEntity(stmt) && stmt.name) {
                termByName.set(stmt.name, stmt);
                nodes.push({ id: stmt.name, label: stmt.name, kind: 'relation-entity' });
            } else if (isUnreifiedRelation(stmt) && stmt.name) {
                termByName.set(stmt.name, stmt);
                // UnreifiedRelation does NOT create a node, only edges
            }
        }

        // Specialization edges for Concepts and Aspects
        for (const t of termByName.values()) {
            const specs: any[] = (t as any).ownedSpecializations ?? [];
            for (const s of specs) {
                const superRef = (s as any).superTerm;
                const superName = superRef?.ref?.name as string | undefined;
                if (superName && t.name && termByName.has(superName)) {
                    // Child (t.name) is source, parent (superName) is target
                    edges.push({
                        id: `${t.name}->${superName}`,
                        source: t.name,
                        target: superName,
                        kind: 'specialization'
                    });
                }
            }
        }

        // Relation edges for RelationEntity/UnreifiedRelation
        // RelationEntity: creates a node in diagram + two edges (source->node, node->target with marker)
        // UnreifiedRelation: creates direct edges only (source->target with marker, no intermediate node)
        for (const t of termByName.values()) {
            if (isRelationEntity(t)) {
                const relName: string | undefined = t.name;
                if (!relName) continue;
                const sources: any[] = (t as any).sources ?? [];
                const targets: any[] = (t as any).targets ?? [];
                for (const s of sources) {
                    const sName = s?.ref?.name as string | undefined;
                    if (!sName) continue;
                    for (const tg of targets) {
                        const tName = tg?.ref?.name as string | undefined;
                        if (!tName) continue;
                        
                        // Create first edge: source -> relation-entity node (no marker)
                        edges.push({
                            id: `${sName}->${relName}`,
                            source: sName,
                            target: relName,
                            kind: 'relation',
                            hasMarker: false
                        });
                        
                        // Create second edge: relation-entity node -> target (arrow marker)
                        edges.push({
                            id: `${relName}->${tName}`,
                            source: relName,
                            target: tName,
                            kind: 'relation',
                            hasMarker: true
                        });
                    }
                }
            } else if (isUnreifiedRelation(t)) {
                const relName: string | undefined = t.name;
                if (!relName) continue;
                const sources: any[] = (t as any).sources ?? [];
                const targets: any[] = (t as any).targets ?? [];
                for (const s of sources) {
                    const sName = s?.ref?.name as string | undefined;
                    if (!sName) continue;
                    for (const tg of targets) {
                        const tName = tg?.ref?.name as string | undefined;
                        if (!tName) continue;
                        
                        // For unreified relations, create direct edge with arrow marker (no intermediate node)
                        edges.push({
                            id: `${sName}->${tName}`,
                            source: sName,
                            target: tName,
                            kind: 'relation',
                            hasMarker: true,
                            label: relName // label shows the relation name on the edge
                        });
                    }
                }
            }
        }
    }

    return { nodes, edges };
}
