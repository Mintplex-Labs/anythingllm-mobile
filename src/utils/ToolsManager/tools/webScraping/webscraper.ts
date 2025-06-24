import { NativeModules } from 'react-native';
const { WebScraperModule } = NativeModules;

interface NativeWebScraper {
    scrape(url: string): Promise<WebScraperResult>;
}

export interface WebScraperResult {
    title: string;
    content: string;
    url: string;
}

class WebScraperInstance {
    private static instance: WebScraperInstance;
    // @ts-ignore-next-line
    private webScraper: NativeWebScraper;

    constructor() {
        if (WebScraperInstance.instance) return WebScraperInstance.instance;
        this.webScraper = WebScraperModule;
        WebScraperInstance.instance = this;
    }

    /**
     * Scrape a website and return the TEXT content. (document.body.innerText)
     */
    async scrape(url: string): Promise<WebScraperResult> {
        return this.webScraper.scrape(url);
    }
}

export default new WebScraperInstance();