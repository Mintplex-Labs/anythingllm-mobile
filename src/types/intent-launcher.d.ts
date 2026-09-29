// The package's own types/index.d.ts imports its raw src/*.ts files, which fail our typecheck.
// tsconfig "paths" points the package here instead; this only affects tsc, not Metro/Babel.
declare const IntentLauncher: {
  startActivity: (args: Record<string, any>) => Promise<{ resultCode: number; data: string; extra: Record<string, any> }>;
};

export default IntentLauncher;
