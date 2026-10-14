<?php
/*
 * CONFIGURAÇÃO — edite este arquivo antes de usar.
 * (Este arquivo é PHP e não aparece para os visitantes.)
 */
return [
    // OBRIGATÓRIO: senha do painel /admin (mínimo 8 caracteres, use uma senha longa e única).
    'admin_password' => 'TROQUE-ESTA-SENHA',

    // Nome da instituição exibido na tela inicial e no certificado (opcional).
    'org_name' => '',

    // Pasta dos dados. Padrão: pasta "data" ao lado deste arquivo (já protegida por .htaccess).
    // Mais seguro: uma pasta FORA de public_html, por ex. '/home/uXXXXXXXX/escuta-data'
    // (crie a pasta pelo Gerenciador de Arquivos). Deixe comentado para usar o padrão.
    // 'data_dir' => '/home/uXXXXXXXX/escuta-data',

    // Use true somente se o site estiver atrás de proxy/CDN que repassa o IP em X-Forwarded-For.
    'trust_proxy' => false,

    // 'auto' (usa Secure quando o acesso é por HTTPS), '1' (sempre) ou '0'.
    'cookie_secure' => 'auto',
];
