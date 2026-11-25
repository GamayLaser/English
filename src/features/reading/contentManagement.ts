import type { ReadingArticle } from "../english/types";

export function removeImportedArticle(articles: ReadingArticle[], articleId: string) {
  return articles.filter((article) => article.id !== articleId || article.source !== "imported");
}
