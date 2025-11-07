import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures, RequestType } from 'vscode-languageserver/node.js';
import { createOmlServices } from 'oml-language';
import type { SModelRoot } from 'sprotty-protocol';
import { computeLaidOutSModelForUri } from './diagram-layout.js';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createOmlServices({ connection, ...NodeFileSystem });

// Custom request: fetch a laid-out Sprotty SModel for a given document URI
const DiagramModelRequest = new RequestType<{ uri: string }, SModelRoot, void>('oml/diagramModel');

connection.onRequest(DiagramModelRequest, async ({ uri }) => {
	try {
		return await computeLaidOutSModelForUri(shared, uri);
	} catch (err) {
		// Return an empty model on failure to keep the client resilient
		console.error('[oml] diagram model error', err);
	return { id: 'root', type: 'graph', children: [] } as unknown as SModelRoot;
	}
});

// Start the language server with the shared services
startLanguageServer(shared);
