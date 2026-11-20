function typeMatches(value, type) {
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function validateValue(value, schema, path) {
  if (!schema || typeof schema !== "object") return null;
  if (schema.type && !typeMatches(value, schema.type)) {
    return `${path} must be ${schema.type}.`;
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    return `${path} must be one of the permitted values.`;
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${path} is too short.`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path} is too long.`;
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} is below the minimum.`;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return `${path} must be greater than the minimum.`;
    if (schema.exclusiveMinimum === true && schema.minimum !== undefined && value <= schema.minimum) return `${path} must be greater than the minimum.`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} exceeds the maximum.`;
    if (schema.exclusiveMaximum === true && schema.maximum !== undefined && value >= schema.maximum) return `${path} must be less than the maximum.`;
  }
  if (typeof value === "string" && schema.format === "date") {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate) return `${path} must be a valid YYYY-MM-DD date.`;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path} has too few items.`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path} has too many items.`;
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        const error = validateValue(value[i], schema.items, `${path}[${i}]`);
        if (error) return error;
      }
    }
  }
  if (schema.type === "object" || (value && typeof value === "object" && !Array.isArray(value))) {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return `${path}.${key} is required.`;
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const error = validateValue(child, properties[key], `${path}.${key}`);
        if (error) return error;
      } else if (schema.additionalProperties === false) {
        return `${path} contains an unsupported property: ${key}.`;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        const error = validateValue(child, schema.additionalProperties, `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  return null;
}

export function validateToolArguments(tool, args) {
  return validateValue(args, tool.inputSchema, "arguments");
}
