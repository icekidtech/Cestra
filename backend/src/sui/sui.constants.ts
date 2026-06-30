// Dependency-injection tokens for the Sui integration layer.
//
// These live in a standalone module (rather than sui.module.ts) so that
// providers can import the tokens without creating a circular import back
// into the module that also imports those same providers.
export const SUI_CLIENT = 'SUI_CLIENT';
export const SUI_KEYPAIR = 'SUI_KEYPAIR';
