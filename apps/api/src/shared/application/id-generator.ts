/** Gera ids das entidades (D22): a aleatoriedade fica fora do domínio. */
export interface IdGenerator {
  newId(): string;
}
