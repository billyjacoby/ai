import { execSync } from 'child_process';
import debug from 'debug';
import fs from 'fs';
import path from 'path';
import { TransformOptions } from './transform-options';

const log = debug('codemod:transform');
const error = debug('codemod:transform:error');

function getJscodeshift(): string {
  const localJscodeshift = path.resolve(
    __dirname,
    '../../node_modules/.bin/jscodeshift',
  );
  return fs.existsSync(localJscodeshift) ? localJscodeshift : 'jscodeshift';
}

function buildCommand(
  codemodPath: string,
  targetPath: string,
  jscodeshift: string,
  options: TransformOptions,
): string {
  // Ignoring everything under `.*/` covers `.next/` along with any other
  // framework build related or otherwise intended-to-be-hidden directories.
  let command = `${jscodeshift} -t ${codemodPath} ${targetPath} \
    --parser tsx \
    --ignore-pattern="**/node_modules/**" \
    --ignore-pattern="**/.*/**"`;

  if (options.dry) {
    command += ' --dry';
  }

  if (options.print) {
    command += ' --print';
  }

  if (options.verbose) {
    command += ' --verbose';
  }

  if (options.jscodeshift) {
    command += ` ${options.jscodeshift}`;
  }

  return command;
}

function parseErrors(output: string): { filename: string; summary: string }[] {
  const errors: { filename: string; summary: string }[] = [];
  const errorRegex = /ERR (.+) Transformation error/g;
  const syntaxErrorRegex = /SyntaxError: .+/g;

  let match;
  while ((match = errorRegex.exec(output)) !== null) {
    const filename = match[1];
    const syntaxErrorMatch = syntaxErrorRegex.exec(output);
    if (syntaxErrorMatch) {
      const summary = syntaxErrorMatch[0];
      errors.push({ filename, summary });
    }
  }

  return errors;
}

export function transform(
  codemod: string,
  source: string,
  options: TransformOptions,
) {
  log(`Applying codemod '${codemod}': ${source}`);
  const codemodPath = path.resolve(__dirname, `../codemods/${codemod}.js`);
  const targetPath = path.resolve(source);
  const jscodeshift = getJscodeshift();
  const command = buildCommand(codemodPath, targetPath, jscodeshift, options);
  const stdout = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  const errors = parseErrors(stdout);
  if (errors.length > 0) {
    errors.forEach(({ filename, summary }) => {
      error(`Error applying codemod [path=${filename}, summary=${summary}]`);
    });
  }
}
