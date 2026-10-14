'use strict';
/*
 * Conteúdo pedagógico do jogo "Jornada da Escuta".
 *
 * Todos os casos são FICTÍCIOS e não descrevem detalhes da violência.
 * Base de referência: Lei 13.431/2017 (Sistema de Garantia de Direitos da
 * Criança e do Adolescente Vítima ou Testemunha de Violência), Decreto
 * 9.603/2018 e ECA (Lei 8.069/1990).
 *
 * IMPORTANTE: antes de usar na capacitação, a equipe técnica da instituição
 * deve revisar o conteúdo e ajustá-lo ao protocolo/fluxo local do município.
 *
 * Para editar: cada item tem `options` com `score` de 0 a 10 (a melhor opção
 * vale 10). Itens do tipo `order` pedem para ordenar passos.
 */

// choice(id, prompt, [[texto, pontos, feedback], ...], extras)
function choice(id, prompt, options, extra) {
  return Object.assign(
    {
      id,
      type: 'choice',
      prompt,
      options: options.map(([text, score, feedback], i) => ({ id: 'o' + (i + 1), text, score, feedback })),
    },
    extra || {}
  );
}

// order(id, prompt, [passos na ordem correta], explicação)
function order(id, prompt, steps, explanation, extra) {
  return Object.assign(
    {
      id,
      type: 'order',
      prompt,
      steps: steps.map((text, i) => ({ id: 's' + (i + 1), text })),
      explanation,
    },
    extra || {}
  );
}

// Classificação de perguntas (fase 3)
const CATS = ['Aberta e acolhedora', 'Sugestiva (induz a resposta)', 'Detalhista ou invasiva', 'Culpabilizadora'];
function question(id, text, correct, why) {
  return choice(
    id,
    'Como classificar esta pergunta?',
    CATS.map((c, i) => [c, i === correct ? 10 : 0, i === correct ? why : 'Não é esta categoria. ' + why]),
    { quote: text, keepOrder: true }
  );
}

const phases = [
  /* ------------------------------------------------------------------ */
  {
    id: 'fundamentos',
    title: 'Fundamentos',
    emoji: '📚',
    summary: 'Conceitos essenciais: escuta especializada, depoimento especial e revelação espontânea.',
    intro:
      'Antes de entrar em campo, vamos alinhar os conceitos. Cada resposta certa rende até 10 pontos de XP.',
    items: [
      choice(
        'f-1',
        'Segundo a Lei 13.431/2017, o que é a ESCUTA ESPECIALIZADA?',
        [
          [
            'Procedimento de entrevista sobre situação de violência com criança ou adolescente perante órgão da rede de proteção, limitado ao estritamente necessário para cumprir sua finalidade de proteção.',
            10,
            'Isso mesmo (Lei 13.431/2017, art. 7º). É feita pela rede de proteção (educação, saúde, assistência social etc.) e o relato fica limitado ao estritamente necessário.',
          ],
          [
            'Oitiva da criança ou do adolescente perante autoridade policial ou judiciária.',
            0,
            'Essa é a definição de DEPOIMENTO ESPECIAL (art. 8º), feito perante autoridade policial ou judiciária.',
          ],
          [
            'Conversa informal para descobrir todos os detalhes do fato e quem é o autor.',
            0,
            'A escuta especializada não é investigação: não busca todos os detalhes nem identificar o autor.',
          ],
          [
            'Avaliação para decidir se a criança está falando a verdade.',
            0,
            'Não cabe ao profissional da rede avaliar credibilidade. A escuta é para proteger e cuidar, não para "testar" a criança.',
          ],
        ]
      ),
      choice(
        'f-2',
        'E o DEPOIMENTO ESPECIAL, o que é?',
        [
          [
            'Procedimento de oitiva de criança ou adolescente vítima ou testemunha de violência perante autoridade policial ou judiciária.',
            10,
            'Correto (Lei 13.431/2017, art. 8º). Deve seguir protocolo e, sempre que possível, ser realizado uma única vez.',
          ],
          [
            'A conversa que o professor tem com a criança na escola.',
            0,
            'Isso se aproxima da escuta/acolhimento na rede de proteção, não do depoimento especial.',
          ],
          [
            'O relatório escrito pela equipe de saúde.',
            0,
            'Relatório é um registro. O depoimento especial é uma oitiva feita por autoridade policial ou judiciária.',
          ],
        ]
      ),
      choice(
        'f-3',
        'O que caracteriza uma REVELAÇÃO ESPONTÂNEA?',
        [
          [
            'A criança ou o adolescente, por iniciativa própria, conta a um adulto de confiança que viveu ou presenciou uma violência.',
            10,
            'Exatamente. Por ser inesperada, exige preparo: o profissional precisa saber acolher, não induzir e encaminhar.',
          ],
          [
            'O profissional pergunta diretamente se a criança sofreu abuso.',
            0,
            'Perguntas diretas e sugestivas fazem o contrário: induzem a resposta. Na revelação espontânea a iniciativa é da criança.',
          ],
          [
            'A família procura o serviço para denunciar um suspeito.',
            0,
            'Isso é uma notícia ou denúncia de terceiros, não uma revelação espontânea da própria criança.',
          ],
        ]
      ),
      choice(
        'f-4',
        'Qual é a finalidade da escuta especializada?',
        [
          [
            'Proteção social e provimento de cuidados. Ela não tem o objetivo de produzir prova.',
            10,
            'Certo. A produção de prova cabe às autoridades; a escuta da rede busca proteger e encaminhar.',
          ],
          ['Reunir provas para condenar o autor.', 0, 'A produção de prova é papel da apuração, não da escuta feita pela rede.'],
          ['Confirmar se o fato realmente ocorreu.', 0, 'Confirmar o fato é papel da investigação. A rede protege e encaminha mesmo com a suspeita.'],
        ]
      ),
      choice(
        'f-5',
        'Quais formas de violência a Lei 13.431/2017 reconhece?',
        [
          [
            'Física, psicológica, sexual e institucional (entre outras formas).',
            10,
            'Correto (art. 4º). A violência psicológica inclui, por exemplo, o bullying e a exposição a violência na família, mesmo sem marcas visíveis.',
          ],
          ['Somente a física e a sexual.', 0, 'A lei é mais ampla: inclui também a violência psicológica e a institucional.'],
          ['Apenas as que deixam marcas visíveis.', 0, 'Muitas violências não deixam marcas visíveis e nem por isso deixam de exigir proteção.'],
        ]
      ),
      choice(
        'f-6',
        'Qual destes é um direito da criança e do adolescente nesse contexto?',
        [
          [
            'Ser ouvido e expressar seus desejos e opiniões, assim como permanecer em silêncio.',
            10,
            'Isso mesmo (Lei 13.431/2017, art. 5º). A criança não é obrigada a falar.',
          ],
          ['Repetir o relato para cada profissional que atende o caso.', 0, 'Ao contrário: a lei busca evitar procedimentos repetitivos que revitimizam.'],
          [
            'Ser colocado frente a frente com o suposto autor para esclarecer os fatos.',
            0,
            'A criança deve ser resguardada de qualquer contato, ainda que visual, com o suposto autor (art. 9º).',
          ],
        ]
      ),
      choice(
        'f-7',
        'Quem realiza a escuta especializada?',
        [
          [
            'Profissionais da rede de proteção (educação, saúde, assistência social etc.), capacitados e dentro do seu papel.',
            10,
            'Isso. Por isso a capacitação é tão importante: o profissional precisa saber o que fazer e também o que NÃO fazer.',
          ],
          ['Somente policiais.', 0, 'Policiais e juízes realizam o depoimento especial; a escuta especializada é feita pela rede de proteção.'],
          ['Qualquer pessoa que queira "investigar" por conta própria.', 0, 'Investigar por conta própria pode prejudicar a criança e a apuração.'],
        ]
      ),
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'revelacao',
    title: 'A Revelação',
    emoji: '🤝',
    summary: 'Cenas interativas: o que dizer e fazer quando uma criança ou adolescente decide contar.',
    intro:
      'Você vai viver duas cenas fictícias. Escolha como responder e acompanhe o medidor de vínculo de confiança. Os casos não trazem detalhes da violência.',
    items: [
      choice(
        'r-a1',
        'Como você responde?',
        [
          [
            '"Obrigado(a) por confiar em mim. Vou te ouvir com atenção. Não posso prometer guardar segredo se alguém estiver te machucando, porque meu trabalho é proteger crianças. Mas vou cuidar de você."',
            10,
            'Acolhe sem prometer sigilo. Promessas de segredo quebram a confiança depois, quando o caso precisa ser comunicado.',
          ],
          ['"Prometo! Não conto pra ninguém. Pode falar."', 0, 'Nunca prometa segredo: você tem o dever de comunicar e a criança se sentirá traída.'],
          ['"Segredo? Então conta logo tudo: quem fez o quê?"', 0, 'Pressão e perguntas diretas desde o início assustam e induzem.'],
          ['"Agora não dá, a gente conversa outro dia."', 2, 'Adiar pode fazer a criança nunca mais tentar. Acolha agora ou combine um momento curto e seguro ainda hoje.'],
        ],
        {
          sceneId: 'escola',
          sceneTitle: 'Cena 1 · No pátio da escola',
          sceneIntro:
            'Você é professor(a). No recreio, Lucas, 9 anos, se aproxima sozinho e olha para o chão.',
          speaker: 'Lucas, 9 anos',
          says: '"Posso te contar um segredo? Mas você não pode contar pra ninguém."',
        }
      ),
      choice(
        'r-a2',
        'Como você reage?',
        [
          [
            '"Obrigado(a) por me contar. Você fez bem. Isso não é culpa sua. Quer me contar mais, do seu jeito?"',
            10,
            'Valida a coragem, retira a culpa e convida ao relato livre, sem pressionar.',
          ],
          ['"Ele tocou em você? Onde? Quantas vezes? Ele ameaçou você?"', 0, 'Interrogatório e perguntas sugestivas: induzem a resposta e revitimizam.'],
          ['"Que horror!! Que homem nojento! Vou chamar a polícia agora!"', 0, 'Reações exageradas assustam a criança, que pode se calar para proteger o adulto ou por medo.'],
          ['"Será que você não entendeu errado? O tio Beto parece tão legal..."', 0, 'Duvidar ou descredibilizar fecha a porta. Não cabe ao profissional julgar a veracidade.'],
        ],
        {
          sceneId: 'escola',
          speaker: 'Lucas, 9 anos',
          says: '"O tio Beto fica me chamando pro quarto quando a mamãe sai. Eu não gosto..."',
        }
      ),
      choice(
        'r-a3',
        'O que você diz?',
        [
          [
            '"Quem faz algo que deixa você desconfortável é quem tem a responsabilidade, nunca você. Você não é culpado. Obrigado(a) por me contar."',
            10,
            'Desfaz a culpa e o medo de "estragar a família", dois motivos pelos quais crianças se calam.',
          ],
          ['"Fica tranquilo, vai ficar só entre nós dois. Ninguém vai saber."', 0, 'É uma promessa de sigilo que você não poderá cumprir.'],
          ['"Vou ligar agora para a sua mãe e contar o que você disse."', 0, 'Avisar a família antes da rede avaliar o risco pode colocar a criança em perigo e comprometer a proteção.'],
          ['"Mas por que você não contou antes?"', 0, 'Pergunta culpabilizadora. Crianças demoram a contar por medo, vergonha e dependência do adulto.'],
        ],
        {
          sceneId: 'escola',
          speaker: 'Lucas, 9 anos',
          says: '"Ele disse que se eu contar a mamãe vai ficar triste e que eu vou ser o culpado."',
        }
      ),
      choice(
        'r-a4',
        'A conversa terminou. Qual é a sua próxima ação?',
        [
          [
            'Registrar fielmente o que foi dito, com as palavras da criança e sem interpretações, e comunicar imediatamente a gestão e o Conselho Tutelar (e/ou autoridade policial, Disque 100), conforme o fluxo local.',
            10,
            'Comunicar é dever legal (Lei 13.431/2017, art. 13). Não é necessário ter certeza: a suspeita já obriga a comunicar.',
          ],
          ['Chamar o tio Beto e a família para esclarecer a situação.', 0, 'Nunca confronte o suposto autor ou a família: isso pode agravar o risco e atrapalhar a apuração.'],
          ['Esperar alguns dias para ter mais certeza antes de comunicar.', 0, 'Esperar mantém a criança exposta. A comunicação deve ser imediata.'],
          ['Pedir que o Lucas conte tudo de novo para a coordenadora, a psicóloga e o diretor.', 0, 'Repetir o relato várias vezes é revitimização. Compartilhe o registro, não a criança.'],
        ],
        { sceneId: 'escola', narration: 'Lucas volta para a sala, mais aliviado. Agora é com você.' }
      ),
      choice(
        'r-a5',
        'Como registrar o que aconteceu?',
        [
          [
            'Transcrever as falas do Lucas entre aspas, com data, hora, local, quem estava presente e o que você observou (sem opiniões).',
            10,
            'O registro fiel evita que a criança precise repetir e protege a qualidade da informação.',
          ],
          ['"Criança relatou que o tio abusou sexualmente dela."', 0, 'Isso é uma conclusão sua. A criança não disse isso: registre as palavras dela.'],
          ['"Criança parece ter imaginação fértil e talvez esteja inventando."', 0, 'Juízo de valor sobre credibilidade não cabe ao registro.'],
        ],
        { sceneId: 'escola' }
      ),

      choice(
        'r-b1',
        'Como você começa a conversa?',
        [
          [
            '"Percebo que isso é difícil. Estou ouvindo você. O que você gostaria que eu soubesse?"',
            10,
            'Pergunta aberta e acolhedora: deixa o controle com a adolescente.',
          ],
          ['"Medo de quê? Ele bateu em você? Já te tocou?"', 0, 'Perguntas fechadas e sugestivas, em sequência, parecem um interrogatório.'],
          ['"Vou chamar seu padrasto aqui para conversarmos os três."', 0, 'Colocar a adolescente diante do possível autor é proibido (art. 9º) e perigoso.'],
          ['"Briga em casa é normal na adolescência."', 0, 'Minimizar fecha a porta. Leve o sinal a sério.'],
        ],
        {
          sceneId: 'cras',
          sceneTitle: 'Cena 2 · No atendimento do CRAS',
          sceneIntro: 'Você é técnico(a) de um serviço de assistência social. Ana, 14 anos, veio ao atendimento acompanhada do padrasto, que aguarda na recepção.',
          speaker: 'Ana, 14 anos',
          says: '"Não quero voltar pra casa hoje. Meu padrasto me deixa com medo."',
        }
      ),
      choice(
        'r-b2',
        'Onde acontece a conversa?',
        [
          [
            'Em sala reservada, tranquila, sem interrupções e sem a presença do padrasto.',
            10,
            'Ambiente apropriado e acolhedor, com privacidade, é exigência da lei (art. 10).',
          ],
          ['No corredor, rapidamente, enquanto a fila espera.', 0, 'Sem privacidade a adolescente não se sentirá segura para falar.'],
          ['Na recepção, com o padrasto sentado ao lado "para equilibrar a versão".', 0, 'Nunca na presença do suposto autor. Isso pode colocá-la em risco.'],
        ],
        { sceneId: 'cras', narration: 'Ana hesita e olha na direção da recepção.' }
      ),
      choice(
        'r-b3',
        'O que você responde?',
        [
          [
            '"Entendo o seu medo. Vou explicar com clareza o que pode acontecer e que a sua proteção vem em primeiro lugar. Vou compartilhar só o necessário com quem pode te proteger, e você será informada a cada passo."',
            10,
            'Transparência sem prometer sigilo. A adolescente participa e entende o que acontece com a sua informação.',
          ],
          ['"Pode ficar tranquila, não conto pra ninguém."', 0, 'Promessa impossível de cumprir.'],
          ['"Se você não contar, eu denuncio seu padrasto de qualquer jeito. Então é melhor falar tudo."', 0, 'Ameaça e coação. Ninguém deve ser pressionado a relatar.'],
          ['"Você TEM que contar, é a lei."', 0, 'A criança tem direito de permanecer em silêncio. O dever de comunicar é do profissional.'],
        ],
        { sceneId: 'cras', speaker: 'Ana, 14 anos', says: '"Eu não quero que ninguém saiba. Se eu contar vai ter polícia e vai ser pior."' }
      ),
      choice(
        'r-b4',
        'Ana já disse o essencial e está chorando muito. O que você faz?',
        [
          [
            'Acolhe, oferece água e uma pausa, não pressiona por mais detalhes e aciona a rede para garantir a proteção e o cuidado dela.',
            10,
            'A escuta é limitada ao estritamente necessário. O cuidado vem antes da informação.',
          ],
          ['Pede que ela descreva tudo em ordem cronológica "para ajudar a polícia".', 0, 'Reunir detalhes para a apuração não é papel da escuta especializada.'],
          ['Pede que reconstitua a cena com desenhos ou bonecos "para o prontuário".', 0, 'Técnicas de reconstituição induzem e revitimizam.'],
          ['Encerra o atendimento e a deixa voltar para casa sozinha.', 0, 'Sem avaliar o risco e comunicar a rede, a adolescente fica desprotegida.'],
        ],
        { sceneId: 'cras', narration: 'Ana passa as mãos no rosto e respira fundo.' }
      ),
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'perguntas',
    title: 'Perguntas que Protegem',
    emoji: '❓',
    summary: 'Treine o ouvido: perguntas abertas, sugestivas, invasivas ou culpabilizadoras?',
    intro:
      'Rodada rápida! Para cada frase, escolha a categoria correta. Lembre: na escuta especializada, o melhor é convidar ao relato livre.',
    items: [
      question('p-1', '"Você quer me contar como está se sentindo?"', 0, 'Convida ao relato livre sem sugerir nada.'),
      question('p-2', '"Foi o seu tio que fez isso, né?"', 1, 'Já traz o nome do suposto autor e a resposta esperada: é sugestiva.'),
      question('p-3', '"O que você gostaria que eu soubesse?"', 0, 'Pergunta aberta: deixa a criança escolher o que dizer.'),
      question('p-4', '"Você estava vestida ou sem roupa nessa hora?"', 2, 'Detalhes íntimos não são necessários à finalidade da escuta e podem causar sofrimento.'),
      question('p-5', '"Por que você deixou ele fazer isso?"', 3, 'Coloca a responsabilidade na vítima. Nunca é culpa da criança.'),
      question('p-6', '"Pode me contar mais sobre isso?"', 0, 'Incentiva o relato com as palavras da própria criança.'),
      question('p-7', '"Ele colocou a mão em você aqui, não foi?" (apontando o corpo)', 1, 'Aponta a resposta e usa um gesto que induz. Evite.'),
      question('p-8', '"Quantas vezes foi, e em que dias exatamente?"', 2, 'Datas e frequência exatas são tarefa da apuração (depoimento especial), não da escuta da rede.'),
      question('p-9', '"Por que você não contou antes?"', 3, 'Soa como cobrança. Crianças demoram a contar por medo, vergonha ou dependência.'),
      question('p-10', '"Tem mais alguma coisa que você queira me dizer?"', 0, 'Pergunta aberta de fechamento: respeita o ritmo da criança.'),
      choice(
        'p-11',
        'A mesma criança já contou a história para três profissionais diferentes. O que fazer?',
        [
          [
            'Usar o registro e a comunicação já feitos, articular a rede e evitar nova escuta. Só ouvir novamente se for realmente necessário.',
            10,
            'Evitar a revitimização é um dos pilares da lei: o registro circula, a criança não precisa repetir.',
          ],
          ['Ouvi-la de novo, para "ter certeza" de que a história é sempre a mesma.', 0, 'Repetição não é teste de verdade e causa sofrimento.'],
          ['Dar o caso por encerrado porque a criança já falou demais.', 0, 'A proteção segue: é preciso garantir a comunicação e o acompanhamento pela rede.'],
        ]
      ),
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'rede',
    title: 'Rede de Proteção',
    emoji: '🕸️',
    summary: 'Fluxos, deveres e cuidados: o que fazer depois da escuta.',
    intro: 'Fluxo, dever de comunicar, sigilo e autocuidado. Nesta fase há desafios de ordenar passos: toque nos itens na sequência certa.',
    items: [
      order(
        'n-1',
        'Ordene os passos após uma revelação espontânea (toque nos itens na ordem correta).',
        [
          'Acolher e ouvir sem interrogar, garantindo a segurança imediata',
          'Registrar fielmente as palavras da criança',
          'Comunicar imediatamente a rede (Conselho Tutelar, autoridade policial ou Disque 100)',
          'Encaminhar para saúde e assistência social conforme a necessidade',
          'Acompanhar o caso sem investigar por conta própria nem expor a criança',
        ],
        'Acolher vem primeiro; registrar e comunicar sem demora; depois encaminhar e acompanhar, sem se tornar investigador.'
      ),
      order(
        'n-2',
        'Ordene as etapas de uma boa escuta especializada.',
        [
          'Preparar um ambiente acolhedor e reservado',
          'Apresentar-se e explicar, em linguagem simples, o motivo da conversa',
          'Convidar ao relato livre, com perguntas abertas',
          'Fazer perguntas de esclarecimento apenas se estritamente necessário, sem induzir',
          'Encerrar com acolhimento e explicar os próximos passos',
        ],
        'Preparar, explicar, escutar, esclarecer o mínimo necessário e encerrar com cuidado.'
      ),
      choice(
        'n-3',
        'Quem tem o dever de comunicar a suspeita ou a confirmação de violência contra criança ou adolescente?',
        [
          [
            'Qualquer pessoa que tenha conhecimento; profissionais como professores e da saúde têm esse dever reforçado.',
            10,
            'Lei 13.431/2017 (art. 13) e ECA (arts. 13 e 245). Não é preciso ter certeza: basta a suspeita.',
          ],
          ['Só a família da criança.', 0, 'A responsabilidade de proteger é de todos, não só da família.'],
          ['Apenas quem tiver provas concretas.', 0, 'Provas são papel da apuração. A suspeita já exige comunicar.'],
        ]
      ),
      choice(
        'n-4',
        'Comunicar a violência ao Conselho Tutelar viola o sigilo profissional?',
        [
          [
            'Não. Comunicar é dever legal. O compartilhamento deve ser restrito ao necessário e à rede de proteção.',
            10,
            'Correto. O cuidado é não expor o caso fora da rede: nada de conversa de corredor ou grupo de WhatsApp.',
          ],
          ['Sim. Só pode comunicar com autorização da família.', 0, 'A família pode ser a autora ou conivente. A comunicação não depende de autorização.'],
          ['Sim. Só com ordem judicial.', 0, 'Não é necessária ordem judicial para comunicar.'],
        ]
      ),
      choice(
        'n-5',
        'Qual canal nacional gratuito recebe denúncias de violência contra crianças e adolescentes?',
        [
          ['Disque 100 (Disque Direitos Humanos).', 10, 'Isso. Funciona todos os dias, inclusive à noite, e pode ser anônimo. Em risco imediato, ligue também para o 190.'],
          ['Disque 180.', 0, 'O 180 é a Central de Atendimento à Mulher. Em casos de crianças, use o 100.'],
          ['Disque 156.', 0, 'O 156 costuma ser canal de serviços municipais, não o canal nacional de denúncias.'],
        ]
      ),
      choice(
        'n-6',
        'Depois de atender um caso muito pesado, o que é mais adequado?',
        [
          [
            'Buscar apoio da equipe e da supervisão, conversar dentro do que o sigilo permite e cuidar da própria saúde emocional.',
            10,
            'Cuidar de quem cuida faz parte do trabalho. Escutar violência afeta o profissional, e pedir ajuda é força.',
          ],
          ['Guardar tudo para si e seguir como se nada tivesse acontecido.', 0, 'O sofrimento acumulado adoece e piora a qualidade do cuidado.'],
          ['Contar os detalhes do caso nas redes sociais para desabafar.', 0, 'Expõe a criança e viola a privacidade.'],
        ]
      ),
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'desafio',
    title: 'Desafio Final',
    emoji: '🏆',
    summary: 'Uma cena complexa que reúne tudo o que você aprendeu. Libera após as quatro primeiras fases.',
    requires: ['fundamentos', 'revelacao', 'perguntas', 'rede'],
    intro: 'Último desafio! Uma situação com uma criança pequena e vários dilemas. Use tudo o que aprendeu.',
    items: [
      choice(
        'd-1',
        'O que você faz?',
        [
          [
            'Observa sem interromper, acolhe, faz uma pergunta aberta e curta ("Me conta sobre essa brincadeira") e registra o que ela disse e fez.',
            10,
            'Crianças pequenas se expressam brincando. Observe e acolha, sem induzir.',
          ],
          ['Pega as bonecas e pede que ela mostre exatamente o que o papai faz.', 0, 'Reencenação conduzida induz e revitimiza.'],
          ['Ignora: criança dessa idade fantasia muito.', 0, 'Todo sinal merece atenção. Cabe à rede avaliar.'],
          ['Liga para a mãe na hora para contar a brincadeira.', 0, 'Avisar a família antes de a rede avaliar o risco pode expor a criança.'],
        ],
        {
          sceneId: 'creche',
          sceneTitle: 'Desafio · Na creche',
          sceneIntro: 'Você é educador(a) de uma creche. Durante a brincadeira, Sofia, 4 anos, brinca com bonecas e diz algo que chama sua atenção.',
          speaker: 'Sofia, 4 anos',
          says: '"A boneca não pode contar o que o papai faz no escuro."',
        }
      ),
      choice(
        'd-2',
        'O que você faz?',
        [
          [
            'Mantém a calma e a postura neutra, não confronta nem revela o conteúdo, e aciona imediatamente a direção para decidir com o Conselho Tutelar e a rede como proceder.',
            10,
            'Evita confronto e mantém a segurança. A decisão sobre a saída da criança deve ser tomada com a rede, não sozinho(a).',
          ],
          ['Conta tudo ao pai e pede explicações.', 0, 'Isso pode colocar a criança em risco e atrapalhar a apuração.'],
          ['Acusa o pai na frente da criança.', 0, 'Expõe a criança a uma situação de conflito. Evite qualquer confronto.'],
        ],
        { sceneId: 'creche', narration: 'No fim da tarde, o pai chega para buscar Sofia e pergunta, sorrindo: "Ela falou alguma coisa hoje?"' }
      ),
      choice(
        'd-3',
        'O que você faz?',
        [
          [
            'Compartilha apenas o que for necessário, com quem precisa saber pelo cargo, e preserva a identidade e a intimidade da criança.',
            10,
            'Confidencialidade protege a criança. O caso circula apenas dentro da rede de proteção.',
          ],
          ['Conta tudo para a colega, afinal ela também trabalha ali.', 0, 'Curiosidade não é necessidade. Quanto menos pessoas souberem, menor a exposição.'],
          ['Posta no grupo de pais um alerta com o nome da criança.', 0, 'Exposição grave: viola a privacidade e pode comprometer a apuração.'],
        ],
        { sceneId: 'creche', narration: 'Na sala dos professores, uma colega cochicha: "Soube que rolou um caso... conta tudo!"' }
      ),
      choice(
        'd-4',
        'Qual relato você entrega?',
        [
          [
            'Relato objetivo: fatos observados, falas literais, data, hora e quem estava presente. Sem opiniões nem diagnósticos.',
            10,
            'O relato descreve o que foi visto e ouvido, sem rótulos.',
          ],
          ['Inclui a hipótese de quem é o autor e supõe diagnósticos.', 0, 'Não cabe ao profissional da rede apontar autoria nem diagnosticar.'],
          ['Entrega só um bilhete: "Houve uma situação, depois a gente conversa."', 0, 'Relato vago atrasa a proteção. A informação precisa ser clara e imediata.'],
        ],
        { sceneId: 'creche', narration: 'O Conselho Tutelar liga pedindo um relato escrito sobre o que aconteceu.' }
      ),
      choice(
        'd-5',
        'Para fechar: o que melhor resume a postura do profissional diante de uma revelação espontânea?',
        [
          [
            'Acolher, escutar sem induzir, não prometer sigilo, registrar fielmente e comunicar à rede. Proteger, e não investigar.',
            10,
            'Essa é a síntese. Parabéns por chegar até aqui! 🎉',
          ],
          ['Descobrir tudo o quanto antes para resolver o caso.', 0, 'Quem apura é a autoridade competente. A rede protege e encaminha.'],
          ['Aguardar a criança repetir a história para ter certeza.', 0, 'Repetir é revitimizar e esperar é arriscar. Acolha, registre e comunique.'],
        ]
      ),
    ],
  },
];

// Índice dos itens para validação rápida no servidor.
const itemIndex = new Map();
for (const phase of phases) {
  for (const item of phase.items) itemIndex.set(item.id, { phase, item });
}

module.exports = { phases, itemIndex };
