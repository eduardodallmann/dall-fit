#!/usr/bin/env node
/* eslint-disable */

const ORG = 'dall-fit';
const PROJECTS = ['dall-fit-types', 'dall-fit-api', 'dall-fit-ui'];
const TOKEN = process.env.SONAR_TOKEN;

if (!TOKEN) {
  console.error('Error: SONAR_TOKEN is required.');
  process.exit(1);
}

async function fetchIssues(project) {
  const url = new URL('https://sonarcloud.io/api/issues/search');
  url.searchParams.set('organization', ORG);
  url.searchParams.set('types', 'CODE_SMELL');
  url.searchParams.set('resolved', 'false');
  url.searchParams.set('ps', '100');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SonarCloud API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const allIssues = data.issues || [];

  // The SonarCloud API does not reliably filter by component/project.
  // Filter client-side by matching the component prefix.
  return allIssues.filter((issue) => {
    const component = issue.component || '';
    return component.startsWith(`${project}:`);
  });
}

async function main() {
  let totalIssues = 0;

  for (const project of PROJECTS) {
    console.log(`\n## ${project}`);
    console.log(
      `Source: https://sonarcloud.io/project/issues?organization=${ORG}&project=${project}`,
    );

    try {
      const issues = await fetchIssues(project);
      totalIssues += issues.length;

      if (issues.length === 0) {
        console.log('No code smells found.');
        continue;
      }

      for (const issue of issues) {
        const file = issue.component?.replace(/^.*?:/, '') || 'unknown';
        const line = issue.line || '?';
        const rule = issue.rule;
        const message = issue.message;
        const severity = issue.severity;

        console.log(`- [${severity}] ${file}:${line}`);
        console.log(`  Rule: ${rule}`);
        console.log(`  ${message}`);
      }
    } catch (error) {
      console.error(`  Error: ${error.message}`);
    }
  }

  console.log(
    `\nTotal: ${totalIssues} code smells across ${PROJECTS.length} projects.\n`,
  );
}

main().catch((error) => {
  console.error('Fatal:', error.message);
  process.exit(1);
});
