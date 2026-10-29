/*
 * Silencia o "Not implemented: HTMLCanvasElement's getContext()" do jsdom.
 * Ao carregar, o Pixi testa os blend modes do canvas (canUseNewCanvasBlendModes)
 * chamando getContext('2d'), que o jsdom não implementa: o erro cai no
 * try/catch do próprio Pixi, e sobra só o aviso no console. Com o getContext
 * devolvendo null, o Pixi cai no mesmo catch, sem o aviso.
 *
 * Fora do setup global: só os arquivos que carregam o Pixi (a cena e o App)
 * importam este módulo, como primeiro import, antes do Pixi. Os testes da cena
 * não dependem do getContext, porque o renderer é fake.
 */
HTMLCanvasElement.prototype.getContext = () => null;

export {};
