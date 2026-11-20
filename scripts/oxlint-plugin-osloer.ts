// Oxlint JS plugin: org rules Oxlint has no built-in for (see issue #121, ADR 0006).
interface DefiniteNode { readonly definite?: boolean }
interface RuleContext { report(descriptor: { node: unknown; messageId: string }): void }

const noDefiniteAssignment = {
  meta: {
    type: "problem",
    docs: { description: "Ban TypeScript definite-assignment assertions (`x!: T`)." },
    messages: {
      banned:
        "Definite-assignment `!:` hides an uninitialised value. Initialise it, make it optional and narrow, or restructure (blanket type-escape ban).",
    },
  },
  create(context: RuleContext) {
    const check = (node: DefiniteNode): void => {
      if (node.definite === true) context.report({ node, messageId: "banned" });
    };
    return { PropertyDefinition: check, VariableDeclarator: check };
  },
};

export default { meta: { name: "osloer" }, rules: { "no-definite-assignment": noDefiniteAssignment } };