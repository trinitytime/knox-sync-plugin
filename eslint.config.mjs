import js from '@eslint/js'
import globals from 'globals'
import config from 'eslint-config-xo'
import { defineConfig } from 'eslint/config'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import tseslint from 'typescript-eslint'

export default defineConfig([
	config,
	{
		files: ['**/*.{js, cjs, mts, vue, ts, tsx, jsx, mjs}'],
		plugins: { js },
		extends: ['js/recommended'],
		languageOptions: { globals: globals.browser },
	},
	tseslint.configs.recommended,
	eslintConfigPrettier,
	eslintPluginPrettier,
])
