# 🚀 Meu Blog Pessoal com Hugo e PaperMod

### 📝 Descrição
Este blog é um espaço dedicado a compartilhar conhecimentos e experiências no vasto universo do desenvolvimento de software, com um foco especial em Java, seu ecossistema, Angular e Cloud. Meu objetivo é criar um repositório de insights e discussões que possam auxiliar outros desenvolvedores em suas jornadas, desde conceitos fundamentais até as tendências mais recentes.

### ✨ Features
*   Construído com Hugo, um gerador de sites estáticos super rápido.
*   Tema moderno e minimalista PaperMod.
*   Suporte a múltiplos idiomas (Português e Inglês).
*   Otimizado para SEO e performance.
*   Comentários integrados (Disqus - se configurado).
*   Personalização de estilo via CSS.

### 🛠️ Tecnologias Utilizadas
*   **Hugo:** Gerador de sites estáticos.
*   **PaperMod:** Tema do Hugo, moderno e responsivo.
*   **GitHub Pages:** Plataforma de hospedagem gratuita.
*   **Git:** Sistema de controle de versão.

### ⚙️ Configuração para Desenvolvimento Local
Para ter o ambiente de desenvolvimento local pronto, siga estes passos:

*   **Pré-requisitos:** Certifique-se de ter o [Hugo instalado](https://gohugo.io/getting-started/installing/).
*   **Clonar o Repositório:**
    1.  Clone o projeto: `git clone https://github.com/omatheusmesmo/blog.omatheusmesmo.dev.git`
    2.  Navegue até a pasta do projeto: `cd blog.omatheusmesmo.dev`
    3.  Inicialize os submódulos do tema: `git submodule update --init --recursive`
*   **Rodar Localmente:**
    *   Inicie o servidor de desenvolvimento do Hugo: `hugo server --baseURL / --buildDrafts`
    *   A flag `--baseURL /` é importante para garantir que os links internos funcionem corretamente no ambiente local.

### 🚀 Deployment (Publicação)
O deployment deste blog é totalmente automatizado. Sempre que novas alterações são enviadas para a branch principal (`main`) no GitHub, um workflow de GitHub Actions é acionado. Este workflow constrói o site Hugo e o publica no GitHub Pages.

O blog está configurado para ser acessível através do domínio personalizado `blog.omatheusmesmo.dev`.

### 🎨 Personalização
Você pode personalizar diversos aspectos do blog:

*   **Estilos CSS:** Ajuste ou adicione estilos no arquivo `assets/css/extended/custom.css`.
*   **Configurações do Site:** Modifique o arquivo de configuração principal `hugo.toml` para alterar parâmetros globais, como título, descrição, configurações de idioma e Disqus.
*   **Seções 'Sobre':** Personalize o conteúdo das suas páginas 'Sobre' nos arquivos `content/about.en.md` e `content/about.pt.md`.

### ✍️ Criação de Conteúdo
Para criar um novo post:

*   Utilize o comando do Hugo para gerar um novo arquivo Markdown, por exemplo:
    `hugo new content posts/meu-novo-post/index.pt.md`
*   Edite o `front matter` (cabeçalho YAML) do seu novo post, incluindo:
    *   `title`: Título do post.
    *   `date`: Data de publicação.
    *   `tags`: Lista de tags relevantes.
    *   `description`: Um breve resumo para miniaturas de redes sociais.
    *   `images`: Caminho para a imagem de capa ou miniatura (ex: `["/images/minha-imagem.jpg"]`).
    *   `summary`: Um resumo breve do conteúdo para exibição em listagens de posts no site.

### 📧 Contato
Sinta-se à vontade para se conectar:

*   **LinkedIn:** [https://www.linkedin.com/in/omatheusmesmo/](https://www.linkedin.com/in/omatheusmesmo/)
*   **GitHub:** [omatheusmesmo](https://github.com/omatheusmesmo)
*   **Email:** [matheus.6148@gmail.com](mailto:matheus.6148@gmail.com)
