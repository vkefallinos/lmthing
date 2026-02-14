/**
 * Definition types that can have proxy objects.
 */
export type DefType = 'def' | 'defData' | 'defSystem' | 'defTool' | 'defAgent';

/**
 * Configuration for creating a definition proxy.
 */
export interface DefinitionProxyConfig {
  tag: string;
  type: DefType;
  name: string;
  onRemind: () => void;
  onDisable: () => void;
}

/**
 * Creates a proxy object for a definition that acts as a string in templates
 * but also provides utility methods (.value, .remind(), .disable()).
 *
 * @param config - Configuration for the proxy
 * @returns A proxy object that can be used in template literals and also provides methods
 */
export function createDefinitionProxy(config: DefinitionProxyConfig) {
  const { tag, onRemind, onDisable } = config;

  const methods: Record<string | symbol, any> = {
    value: tag,
    remind: () => { onRemind(); return tag; },
    disable: () => { onDisable(); return tag; },
    toString: () => tag,
    valueOf: () => tag,
    [Symbol.toPrimitive]: () => tag,
  };

  const methodKeys = ['value', 'remind', 'disable'];

  return new Proxy({}, {
    get(_target, prop) {
      if (prop in methods) {
        return methods[prop];
      }
      return tag;
    },
    has(_target, prop) {
      return prop in methods;
    },
    ownKeys() {
      return methodKeys;
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && prop in methods) {
        return { enumerable: true, configurable: true, value: methods[prop] };
      }
      return undefined;
    }
  });
}
