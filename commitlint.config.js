export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Nova funcionalidade
        'fix',      // Correção de bug
        'docs',     // Documentação
        'style',    // Formatação (não afeta código)
        'refactor', // Refatoração
        'perf',     // Melhoria de performance
        'test',     // Testes
        'build',    // Build system
        'ci',       // CI/CD
        'chore',    // Tarefas de manutenção
        'revert',   // Reverter commit
      ],
    ],
    'subject-case': [0], // Desabilita regra de case para permitir português
    'body-max-line-length': [0], // Desabilita limite de linha no body
  },
}
