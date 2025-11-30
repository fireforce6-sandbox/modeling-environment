import { URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';
import {
    isVocabulary,
    isConcept,
    isAspect,
    isRelationEntity,
    isUnreifiedRelation,
    isPropertyCardinalityRestrictionAxiom,
    type Vocabulary as AstVocabulary,
    type Entity as AstEntity,
    type RelationEntity as AstRelationEntity,
    type UnreifiedRelation as AstUnreifiedRelation,
    type SemanticProperty as AstSemanticProperty,
    type PropertyRestrictionAxiom as AstPropertyRestrictionAxiom,
    type SpecializationAxiom as AstSpecializationAxiom
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
    // Optional center label (legacy); for relations we prefer tail/head labels
    label?: string;
    labelTail?: string;
    labelHead?: string;
    hasMarker?: boolean; // false means no marker, true means relation arrow (for relation entity edges)
};

export type DiagramModel = { nodes: DiagramNode[]; edges: DiagramEdge[] };

function formatCardinality(kind: 'exactly' | 'min' | 'max', value: number): string {
    if (kind === 'exactly') {
        return `[${value}]`;
    }
    if (kind === 'min') {
        return `[${value}..*]`;
    }
    // kind === 'max'
    return `[0..${value}]`;
}

/**
 * Build a lookup from (owning entity, relation name) to explicit cardinality text.
 */
function computeCardinalityMap(vocab: AstVocabulary): Map<string, string> {
    const map = new Map<string, string>();

    const push = (entity: AstEntity | undefined, prop: AstSemanticProperty | undefined, kind: 'exactly' | 'min' | 'max', card: number) => {
        if (!entity || !entity.name || !prop) return;

        if ('forwardRelation' in prop || 'reverseRelation' in prop) {
            const rel = prop as AstRelationEntity | AstUnreifiedRelation;
            const relName = rel.name;
            if (!relName) return;

            const key = `${entity.name}::${relName}`;
            if (!map.has(key)) {
                map.set(key, formatCardinality(kind, card));
            }
        } else {
            // Scalar properties etc. are not used for relation edge labels.
            return;
        }
    };

    for (const stmt of vocab.ownedStatements ?? []) {
        const container = stmt as any as AstEntity | AstRelationEntity;
        const restrictions: AstPropertyRestrictionAxiom[] = (container as any).ownedPropertyRestrictions ?? [];
        for (const r of restrictions) {
            if (!isPropertyCardinalityRestrictionAxiom(r)) continue;
            const prop = r.property?.ref as AstSemanticProperty | undefined;
            const kind = r.kind;
            const card = r.cardinality as number;
            if (kind === 'exactly' || kind === 'min' || kind === 'max') {
                push(container as any, prop, kind, card);
            }
        }

        // If this is a relation with no explicit cardinality restrictions on an owning
        // entity, fall back to [0..1] when it is declared functional. We treat this as
        // a shorthand default so that functional relations still display a useful
        // cardinality even without an explicit `restricts` axiom.
        if (isRelationEntity(container) || isUnreifiedRelation(container)) {
            const rel = container as AstRelationEntity | AstUnreifiedRelation;
            const relName = rel.name;
            if (!relName) continue;

            // Find all entities that this relation uses as a source; for each such
            // entity, if there is no explicit cardinality mapping yet and the
            // relation is functional, mark it as [0..1].
            const srcs: any[] = (rel as any).sources ?? [];
            for (const s of srcs) {
                const ent = s?.ref as AstEntity | undefined;
                const entName = ent?.name;
                if (!entName) continue;
                const key = `${entName}::${relName}`;
                if (!map.has(key) && (rel as any).functional) {
                    map.set(key, '[0..1]');
                }
            }
        }
    }

    return map;
}

/**
 * Build a lookup from a relation name to the list of its direct super-relations
 * (by name) based on specialization axioms. This is used purely for display in
 * relation labels as `{subsets parent}` lines.
 */
function computeRelationSubsets(vocab: AstVocabulary): Map<string, string[]> {
    const map = new Map<string, string[]>();

    const record = (subName: string | undefined, specs: AstSpecializationAxiom[] | undefined) => {
        if (!subName || !specs) return;
        for (const s of specs) {
            const sup = s.superTerm?.ref as any;
            const supName: string | undefined = sup?.name;
            if (!supName) continue;
            const arr = map.get(subName) ?? [];
            if (!arr.includes(supName)) arr.push(supName);
            map.set(subName, arr);
        }
    };

    for (const stmt of vocab.ownedStatements ?? []) {
        if (isRelationEntity(stmt)) {
            record(stmt.name, (stmt as any).ownedSpecializations as AstSpecializationAxiom[] | undefined);
        } else if (isUnreifiedRelation(stmt)) {
            record(stmt.name, (stmt as any).ownedSpecializations as AstSpecializationAxiom[] | undefined);
        }
    }

    return map;
}

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
        const vocab = root as AstVocabulary;
        const cardinalities = computeCardinalityMap(vocab);
        const subsetOf = computeRelationSubsets(vocab);

        const termByName = new Map<string, any>();
        for (const stmt of vocab.ownedStatements ?? []) {
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
        // RelationEntity: creates a node in diagram + two visual edges (source->node, node->target with marker)
        // UnreifiedRelation: creates direct edges only (source->target with marker, no intermediate node).
        for (const t of termByName.values()) {
            if (isRelationEntity(t)) {
                const relName: string | undefined = t.name;
                if (!relName) continue;
                const sources: any[] = (t as any).sources ?? [];
                const targets: any[] = (t as any).targets ?? [];
                const forwardName: string | undefined = (t as any).forwardRelation?.name;
                const reverseName: string | undefined = (t as any).reverseRelation?.name;
                for (const s of sources) {
                    const sName = s?.ref?.name as string | undefined;
                    if (!sName) continue;
                    for (const tg of targets) {
                        const tName = tg?.ref?.name as string | undefined;
                        if (!tName) continue;

                        const forward = forwardName ?? relName;
                        const reverse = reverseName ?? '';

                        const forwardKey = `${(s as any).ref?.name ?? ''}::${relName}`;
                        const forwardCard = forward ? cardinalities.get(forwardKey) : undefined;

                        const forwardLabel = forwardCard ? `${forward} ${forwardCard}` : forward;
                        const reverseLabel = reverse;

                        let combinedLabel = reverseLabel && forwardLabel
                            ? `${reverseLabel}\n${forwardLabel}`
                            : (forwardLabel ?? reverseLabel ?? '');

                        // If this relation is a specialization of one or more
                        // other relations, append subset information on its
                        // forward end label block.
                        const supers = subsetOf.get(relName) ?? [];
                        if (supers.length > 0 && forwardLabel) {
                            const subsetLines = supers.map(sup => `{subsets ${sup}}`).join('\n');
                            combinedLabel = reverseLabel && forwardLabel
                                ? `${reverseLabel}\n${forwardLabel}\n${subsetLines}`
                                : `${forwardLabel}\n${subsetLines}`;
                        }

                        // First visual segment: source -> relation-entity node (no marker)
                        edges.push({
                            id: `${sName}->${relName}`,
                            source: sName,
                            target: relName,
                            kind: 'relation',
                            hasMarker: false,
                            label: combinedLabel
                        });
                        
                        // Second visual segment: relation-entity node -> target (arrow marker)
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
                const forwardName: string | undefined = (t as any).forwardRelation?.name ?? relName;
                const reverseName: string | undefined = (t as any).reverseRelation?.name;
                for (const s of sources) {
                    const sName = s?.ref?.name as string | undefined;
                    if (!sName) continue;
                    for (const tg of targets) {
                        const tName = tg?.ref?.name as string | undefined;
                        if (!tName) continue;

                        const forward = forwardName;
                        const reverse = reverseName ?? '';

                        const forwardKey = `${(s as any).ref?.name ?? ''}::${relName}`;
                        const forwardCard = forward ? cardinalities.get(forwardKey) : undefined;

                        const forwardLabel = forwardCard ? `${forward} ${forwardCard}` : forward;
                        const reverseLabel = reverse;

                        let combinedLabel = reverseLabel && forwardLabel
                            ? `${reverseLabel}\n${forwardLabel}`
                            : (forwardLabel ?? reverseLabel ?? '');

                        const supers = subsetOf.get(relName) ?? [];
                        if (supers.length > 0 && forwardLabel) {
                            const subsetLines = supers.map(sup => `{subsets ${sup}}`).join('\n');
                            combinedLabel = reverseLabel && forwardLabel
                                ? `${reverseLabel}\n${forwardLabel}\n${subsetLines}`
                                : `${forwardLabel}\n${subsetLines}`;
                        }

                        // For unreified relations, create direct edge with arrow marker (no intermediate node)
                        edges.push({
                            id: `${sName}->${tName}`,
                            source: sName,
                            target: tName,
                            kind: 'relation',
                            hasMarker: true,
                            label: combinedLabel
                        });
                    }
                }
            }
        }
    }

    return { nodes, edges };
}
