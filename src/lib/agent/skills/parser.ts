import { isNil } from '@vxti/typed';
import fs from 'node:fs/promises';
import { type AgentSkill, FrontMatterSchema } from './common';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { parse as parseYaml } from 'yaml';

export async function readSkillFile(
  path: string
): Promise<AgentSkill | undefined> {
  const content = await fs.readFile(path, 'utf8');

  const tree = fromMarkdown(content, {
    extensions: [frontmatter(['yaml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
  });

  const yamlNodeIdx = tree.children.findIndex(node => node.type === 'yaml');
  if (
    yamlNodeIdx !== 0 ||
    isNil(tree.children[yamlNodeIdx]) ||
    tree.children[yamlNodeIdx].type !== 'yaml'
  ) {
    console.log(
      'Failed reading skill file:',
      tree.children[yamlNodeIdx],
      yamlNodeIdx
    );
    return;
  }

  const yamlNode = tree.children[yamlNodeIdx];
  const metadataRes = await FrontMatterSchema.safeParseAsync(
    parseYaml(yamlNode.value)
  );
  if (!metadataRes.success) return;

  const endOffset = yamlNode.position?.end.offset ?? 0;

  return {
    ...metadataRes.data,
    path,
    content: content.slice(endOffset).trimStart(),
  };
}
