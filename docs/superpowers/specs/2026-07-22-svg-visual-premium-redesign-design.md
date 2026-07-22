# Design: Redesign visual premium do SVG (flat art-directed)

- **Data:** 2026-07-22
- **Status:** Aprovado (design) — aguardando revisão da spec
- **Escopo:** melhoria visual "considerável" da visualização do sistema solar em SVG
- **Branch alvo:** a definir (feature branch dedicada)

---

## 1. Contexto e estado atual

`SolarSys` gera um SVG animado de um sistema solar via PHP puro (`src/SolarSystemSvg.php`, `src/Planet.php`, entrada `index.php`), sem libs e sem JS. Estado visual atual (main `48c8a72`):

- **Planetas/luas:** disco com gradiente radial claro→escuro, manchas/continentes procedurais (curvas `Q`) em paleta de 3 tons por estilo, sombra direcional (`sun-shadow`, gradiente linear) + drop-shadow radial, 10 estilos sorteados; órbita bezier (kappa) animada por `animateMotion`.
- **Sol:** gradiente radial + manchas solares procedurais + glow radial.
- **Fundo:** 5 temas de nebulosa (gradientes multi-camada) + ~6.000 estrelas individuais (`<use>` de um `<symbol>` de estrela) + estrelas brilhantes com glow.
- **Peso atual:** ~654 KB por render (dominado pelas ~6.000 estrelas).
- **Não usa** filtros SVG nem qualquer coesão de paleta entre elementos (cada um sorteia independentemente).

## 2. Objetivo

Elevar **consideravelmente** a qualidade visual mantendo a identidade PHP→SVG, num estilo **flat/vetorial premium** (ilustração/pôster), com **coesão de paleta art-directed por render** e **novos elementos** (anéis, atmosfera, cinturão de asteroides, cometas).

### Critérios de sucesso
1. Look flat-premium coeso: numa mesma cena, planetas, anéis, atmosfera, sol e fundo saem da **mesma família de cores**.
2. Os 4 novos elementos presentes e integrados.
3. Continua **PHP→SVG puro, sem JS**; animação em SMIL/CSS.
4. Peso por render **bem abaixo** dos 654 KB atuais (alvo ~150–300 KB) parecendo mais rico.
5. Zero erros/warnings PHP; SVG bem-formado.

## 3. Requisitos (decididos no brainstorming)

- **Direção estética:** flat/vetorial premium.
- **Novos elementos:** anéis planetários, atmosfera/halo, cinturão de asteroides, cometas/estrelas cadentes (todos).
- **Coesão:** procedural **art-directed** — cada render escolhe UM tema/paleta e harmoniza tudo.
- **Guardrails:** PHP→SVG puro, **sem JS**, animação SMIL/CSS, qualidade em 1º (otimizar peso com `<symbol>`/`<use>`).

## 4. Arquitetura (Abordagem A — motor de paleta + classes de elemento)

Unidades pequenas, isoladas, com uma responsabilidade clara. Namespace `SolarSystemSvg\` (PSR-4, como hoje).

| Unidade | Responsabilidade | Depende de | Interface pública (essência) |
|---|---|---|---|
| `Color` (util estático) | Manipulação de cor | — | `tint($hex,$p)`, `shade($hex,$p)`, `mix($a,$b,$p)`, `hueShift($hex,$deg)`, `rgba($hex,$a)` |
| `Theme` | Sorteia 1 paleta nomeada e **deriva** cores por papel | `Color` | `planet($i)`, `ring()`, `atmosphere()`, `sun()`, `background()`, `star()`, `asteroid()`, `comet()`, `name()` |
| `Planet` (refatorado) | Disco flat + terminador + continentes + atmosfera + anel opcional + órbita + lua | `Theme`, `Ring` | `getOrbit()`, `getPlanet()` |
| `Ring` | Elipse inclinada com oclusão frente/trás | `Theme` | `back($ctx)`, `front($ctx)` |
| `AsteroidBelt` | Faixa elíptica de asteroides (`<symbol>`+`<use>`) com drift | `Theme` | `render()` |
| `Comet` | Corpo + cauda cônica em `animateMotion` (loop) | `Theme` | `render()`, `defs()` |
| `SolarSystemSvg` (refatorado) | Dono do `Theme`; monta camadas em z-order; API `addPlanet`/`render` | todos acima | `addPlanet()`, `render()` |

**Fluxo de dados:** `SolarSystemSvg` cria um `Theme` (seed `mt_rand`) → injeta o `Theme` em cada elemento → cada elemento pede cores por papel → `SolarSystemSvg` compõe as camadas em z-order → emite o SVG.

**Compatibilidade:** a assinatura pública `addPlanet($size, $distance, $moon)` e `render()` é preservada; `index.php` muda pouco (opcionalmente, para declarar quais planetas têm anel).

## 5. Motor de paleta (`Theme`)

Cada tema define **papéis**, não cores soltas:

- `bg[]` — 3–4 tons para a nebulosa de fundo.
- `sunTint` — matiz quente base do sol.
- `planetHues[]` — conjunto de matizes **harmônicos entre si** (análogos ou tríade dentro do tema); `Planet` recebe um índice e o `Theme` deriva `base/light/dark/stains` via `Color`.
- `accent` — cor de destaque para atmosfera, anéis e cauda de cometa.
- `starTints[]` — 2–3 tons de estrela coerentes com o fundo.

~6 temas nomeados iniciais: **Aurora**, **Ember**, **Abissal**, **Amethyst**, **Verdant**, **Mono**. Um `Theme` é criado por render; todos os elementos daquela cena consomem o mesmo.

## 6. Técnica flat-premium por elemento

- **Planeta:** disco de cor base + **terminador chapado alinhado ao sol** — o lado oposto ao sol recebe um overlay em tom `shade`, recortado ao disco e dividido por uma curva limpa (2 tons premium), substituindo o gradiente linear atual. Continentes: **menos blobs e mais limpos**, em `tint` harmônico. Sombra: **um** drop-shadow suave (blur leve via `feGaussianBlur` — filtro SVG, sem JS).
- **Atmosfera/halo:** anel fino translúcido no `accent`, por fora do disco (dá "ar"/profundidade sem blur pesado).
- **Sol:** disco chapado com 2–3 bandas tonais quentes do `sunTint` + coroa/glow suave; manchas simplificadas.
- **Fundo:** nebulosa coesa (poucas camadas de `bg[]`) + **estrelas otimizadas** em 2–3 tiers (`<symbol>`+`<use>`, contagem reduzida) + **vinheta** sutil para enquadrar (assinatura premium).

## 7. Novos elementos

- **Anéis (`Ring`):** parte de trás desenhada **antes** do planeta e a frente **depois** (oclusão correta), 2–3 faixas chapadas + gap, inclinação (tilt) por planeta. Anéis são atribuídos **proceduralmente** a um subconjunto dos planetas (probabilidade sensata por cena), sobrescrevível via `index.php`.
- **Cinturão de asteroides (`AsteroidBelt`):** faixa elíptica entre duas órbitas; N `<use>` de 1–2 `<symbol>` de asteroide (formas irregulares pequenas), com leve rotação/drift do grupo via `animateTransform`.
- **Cometas (`Comet`):** 1–3 por cena; corpo + cauda cônica afinando (no `accent`), percorrendo um path off-screen→off-screen em loop (`animateMotion`) com `begin` defasado.

## 8. Composição, z-order e animação

**Z-order:** `nebulosa → estrelas → vinheta(trás) → cinturão → órbitas → sol (+glow) → planetas (+luas/anéis) → cometas`.

**Animação (SMIL/CSS, sem JS):** órbitas de planetas/luas (como hoje), **drift** do cinturão, cometas em loop defasado, e **twinkle** opcional das estrelas (CSS/SMIL leve). Sem `Date.now()`/JS.

## 9. Performance

- Trocar as ~6.000 estrelas soltas por `<symbol>`+`<use>` em tiers e **reduzir a contagem** (flat-premium pede menos estrelas, porém deliberadas).
- Asteroides via 1–2 `<symbol>` reutilizados.
- `<defs>`/gradientes compartilhados por tema quando possível (evitar duplicar por-elemento onde não precisa).
- **Meta:** peso por render ~150–300 KB (vs. 654 KB atuais).

## 10. Tratamento de erros

- Índices de tema/paleta com defaults seguros (sem `undefined index`).
- Contagens de asteroides/cometas limitadas por `min/max`.
- Elemento ausente (ex.: planeta sem anel) simplesmente não renderiza — degrade silencioso.
- Como é um gerador determinístico por seed, "erros" são majoritariamente índices indefinidos; cobertos por defaults + testes.

## 11. Testes e verificação

- **Smoke harness (estendido):** renderizar **todos os temas** e cenas representativas; afirmar:
  - zero warnings/notices PHP (handler que lança em qualquer aviso);
  - SVG bem-formado — 1 `<svg>`, tags `<g>`/`<defs>` balanceadas, e `xmllint --noout` se disponível;
  - presença de cada novo elemento (anel, atmosfera, asteroide, cometa) quando aplicável;
  - peso dentro da meta.
- **Verificação visual:** servidor PHP embutido (`php -S`) já usado nesta sessão; o usuário abre no browser e confere a animação.

## 12. Fora de escopo (YAGNI)

- Sem JS/interatividade (hover, parallax, tooltips).
- Sem realismo por `feTurbulence`/`feDisplacementMap`.
- Sem libs externas; sem mudar o pipeline PHP→SVG.
- Sem persistência, configuração ou UI de controle.

## 13. Defaults escolhidos (sobrescrevíveis)

~6 temas iniciais; terminador flat 2-tons; sombra com blur leve; alvo de peso ~150–300 KB; twinkle de estrelas opcional; z-order acima.

## 14. Riscos / notas

- Refactor toca `Planet` e `SolarSystemSvg` (métodos-string grandes) — mitigado quebrando em unidades e mantendo a API pública.
- Anéis com oclusão exigem desenhar o planeta em duas passadas (trás/frente) — encapsulado em `Ring`.
- Reduzir estrelas muda a "densidade" atual; ajustar contagem por tier para manter riqueza.
