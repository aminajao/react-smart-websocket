import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const external = [
  ...Object.keys(pkg.peerDependencies || {}),
  'react/jsx-runtime'
];

export default {
  input: 'src/index.ts',
  external,
  output: [
    {
      file: 'lib/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true
    },
    {
      file: 'lib/index.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  plugins: [
    resolve({
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    }),
    typescript({
      tsconfig: './tsconfig.build.json',
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx']
    })
  ]
};
