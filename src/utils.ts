export const isBlockHash = (hash: any): hash is string => {
  if (typeof hash !== "string") {
    return false;
  }
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}; 