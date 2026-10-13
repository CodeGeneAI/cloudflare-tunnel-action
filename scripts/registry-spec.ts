/**
 * A dependency as the npm registry knows it: the package name to look up and
 * the semver range the project declared for it.
 */
export interface RegistrySpec {
  readonly registryName: string;
  readonly range: string;
}

// `npm:<package>@<range>` is the npm alias syntax, e.g.
// "npm:@typescript/typescript6@^6.0.2". The package name may be scoped.
// https://docs.npmjs.com/cli/v11/using-npm/package-spec#aliases
const NPM_ALIAS = /^npm:(?<name>(?:@[^/@]+\/)?[^/@]+)@(?<range>.+)$/;

/**
 * Resolves a `package.json` dependency entry to the registry package and range
 * a drift check must compare. A plain range keeps the declared name; an
 * `npm:` alias points at the aliased package, because the declared name only
 * decides the folder under `node_modules`.
 */
export const resolveRegistrySpec = (
  declaredName: string,
  declaredRange: string,
): RegistrySpec => {
  const alias = NPM_ALIAS.exec(declaredRange);
  const name = alias?.groups?.name;
  const range = alias?.groups?.range;
  if (name === undefined || range === undefined) {
    return { registryName: declaredName, range: declaredRange };
  }
  return { registryName: name, range };
};
