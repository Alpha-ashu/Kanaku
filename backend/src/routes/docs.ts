import { Router } from 'express';
import { generateApiTestingGuide, generateOpenApiDocument } from '../docs/api-docs';

const router = Router();

const getBaseUrl = (req: any) => `${req.protocol}://${req.get('host')}`;

router.get('/openapi.json', (req, res) => {
  res.json(generateOpenApiDocument(getBaseUrl(req)));
});

router.get('/testing-guide', (req, res) => {
  res.type('text/markdown').send(generateApiTestingGuide(getBaseUrl(req)));
});

router.get('/', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const openApiUrl = `${baseUrl}/api-docs/openapi.json`;
  const testingGuideUrl = `${baseUrl}/api-docs/testing-guide`;

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KANAKU API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #f8fafc; }
      .topbar { display: none; }
      .docs-links {
        display: flex;
        gap: 12px;
        padding: 16px 24px 0;
        font-family: Arial, sans-serif;
      }
      .docs-links a {
        color: #0f172a;
        text-decoration: none;
        padding: 10px 14px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
      }
    </style>
  </head>
  <body>
    <div class="docs-links">
      <a href="${openApiUrl}" target="_blank" rel="noreferrer">OpenAPI JSON</a>
      <a href="${testingGuideUrl}" target="_blank" rel="noreferrer">API Testing Guide</a>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${openApiUrl}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 2,
        docExpansion: "list"
      });
    </script>
  </body>
</html>`);
});

export { router as docsRoutes };

