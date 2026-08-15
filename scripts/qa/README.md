# Auditoria de layout

Scripts que medem o **DOM renderizado** procurando defeito de layout — não leem
código, abrem o site de verdade com Playwright.

Detectam:

| Sinal                 | O que é                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `a-dentro-de-button`  | `<a>` aninhado em `<button>`: HTML inválido e origem de botão deformado                         |
| `conteudo-quebrado`   | Filho que volta para a esquerda **e** desce dentro de um flex row — ícone caindo acima do texto |
| `overflow-horizontal` | Página mais larga que a janela                                                                  |
| `vaza-do-container`   | Elemento que ultrapassa a caixa do pai (grid apertado no celular)                               |

> A regra de quebra compara posição, não altura: comparar topo ou centro dá
> falso positivo com ícone de 16px ao lado de texto de 20px, ou com card
> `items-start` de várias linhas.

## Uso

```bash
# Painel admin, todas as abas, 3 larguras × 2 temas
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node scripts/qa/audit-admin.mjs

# Modais do admin (é onde mora o risco)
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... node scripts/qa/audit-modais.mjs
```

Credenciais em `CLAUDE.local.md`. `TOTAL: 0` é o resultado esperado.

`<option>` é ignorado de propósito: a caixa dele não participa do layout do pai.
