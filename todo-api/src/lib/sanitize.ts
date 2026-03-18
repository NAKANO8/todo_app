import xss from "xss";

export function sanitize(input: string) {
  return xss(input);
}
