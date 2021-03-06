const pupHelper = require('./puppeteerhelper');
const pLimit = require('p-limit');
const fs = require('fs');
const _ = require('underscore');
const moment = require('moment');
const {brandLink, newLink} = require('./keys');
let browser;
let products = [];
let productsLinks = [];

const saveToCsv = (feature) => new Promise(async (resolve, reject) => {
  try {
    // Save Header
    const fileName = `results-${feature} ${moment().format('DD-MM-YYYY HH-mm')}.csv`
    const requiredFields = ['Brand','Model','Sensori','Sistema operativo OS', 'Chipset', 'Processore CPU', 'Processore grafico GPU', 'Memoria esterna', 'Memoria Interna', 'Data di uscita', 'Dimensioni (AxLxP)', 'Peso', 'Corpo', 'Colori', 'Batteria', 'Prezzo approssimativo', 'Scheda SIM', 'Rete', 'Velocità', 'GPRS', 'Edge', 'Wi-Fi', 'GPS', 'NFC', 'USB', 'Bluetooth', 'Radio', 'Jack per cuffie', 'Tecnologia', 'Touch screen', 'Profondità dei colori', 'Dimensioni', 'Area dello schermo', 'Formato', 'Rapporto schermo / corpo', 'Risoluzione', 'Densità Pixel', 'Fotocamera posteriore, base', 'Caratteristiche tecniche', 'Funzioni', 'Video', 'Fotocamera frontale, selfie', 'Specificazioni', 'Funzioni'];
    let csvHeader = '"URL",';
    for (let i = 0; i < requiredFields.length; i++) {
      if (i != requiredFields.length - 1) {
        csvHeader+= `"${requiredFields[i]}",`;
      } else {
        csvHeader+= `"${requiredFields[i]}"\r\n`;
      }
    }
    fs.writeFileSync(fileName, csvHeader, 'utf8');

    // Save Data
    for (let i = 0; i < products.length; i++) {
      let csvLine = `"${products[i].url}"`;
      for (let j = 0; j < requiredFields.length; j++) {
        if (products[i][requiredFields[j].toLowerCase()]) {
          csvLine += `,"${products[i][requiredFields[j].toLowerCase()].replace(/\"/gi, "'").trim().replace(/^\-/gi, '').trim()}"`;
        } else {
          csvLine += ',""'
        }
      }
      csvLine+= '\r\n';
      fs.appendFileSync(fileName, csvLine, 'utf8');
    }

    resolve(true);
  } catch (error) {
    console.log(`saveToCsv Error: ${error.message}`);
    reject(error);
  }
})

const fetchFromBrand = (feature) => new Promise(async (resolve, reject) => {
  try {
    console.log('Started Scraping...');

    // Launch the Browser
    browser = await pupHelper.launchBrowser();

    // Fetch Products Links for Brand
    console.log(`Fetching Products Links from Brand [${brandLink}]...`);
    productsLinks = await fetchLinksFromBrand();
    productsLinks = _.uniq(productsLinks);
    console.log(`Number of Products found for Brand: ${productsLinks.length}`);
    fs.writeFileSync('productsLinks.json', JSON.stringify(productsLinks));

    // Fetch Products Details for Brand
    console.log('Fetching Products Details...');
    const limit = pLimit(5);
    const promises = [];
    for (let i = 0; i < productsLinks.length; i++) {
      promises.push(limit(() => fetchProduct(productsLinks[i], i + 1, productsLinks.length)));
    }
    await Promise.all(promises);
    fs.writeFileSync('products.json', JSON.stringify(products));

    // Save Results to Csv
    console.log('Writing Csv...');
    await saveToCsv(feature);
    
    console.log('Finished Scraping...');
    await browser.close();
    resolve(true);
  } catch (error) {
    if (browser) await browser.close();
    console.log(`fetchFromBrand Error: ${error.message}`);
    reject(error);
  }
});

const fetchLinksFromBrand = () => new Promise(async (resolve, reject) => {
  let page;
  try {
    page = await pupHelper.launchPage(browser);
    await page.goto(brandLink, {timeout: 0, waitUntil: 'load'});
    await page.waitForSelector('.row.product-page > .col-md-2 > .product-item');
    const productsLinks = await pupHelper.getAttrMultiple('.row.product-page > .col-md-2 > .product-item > .list-items > a', 'href', page);

    await page.close();
    resolve(productsLinks);
  } catch (error) {
    if (page) await page.close();
    console.log(`fetchLinksFromBrand [${brandLink}] Error: `, error.message);
    reject(error);
  }
});

const fetchProduct = (productLink, current, total) => new Promise(async (resolve, reject) => {
  let page;
  try {
    const prod = {url: productLink};
    console.log(`${current}/${total} - Fetching Product Details [${productLink}]...`);
    page = await pupHelper.launchPage(browser, true);
    await page.goto(productLink, {timeout: 0, waitUntil: 'networkidle2'});
    await page.waitForSelector('.datasheet.table tr');

    const trs = await page.$$('.datasheet.table tr');
    for (let i = 0; i < trs.length; i++) {
      const trText = await page.evaluate(elm => elm.innerText.trim(), trs[i]);
      if (trText.toLowerCase().startsWith('- sensori')) {
        prod.sensori = trText.replace(/\- sensori \-/gi, '').trim()
      }
      const isProp = await trs[i].$('td.datasheet-features-type');
      if (isProp) {
        const propLabel = await trs[i].$eval('td.datasheet-features-type', elm => elm.innerText.toLowerCase());
        const isSingleLine = await trs[i].$$('td');
        let propValue = '';
        if (isSingleLine.length == 2) {
          propValue = await trs[i].$eval('td:not(.datasheet-features-type)', (elm) => elm.innerText.trim())
        } else {
          propValue = await trs[i+1].$eval('td', (elm) => elm.innerText.trim());
        }
        prod[propLabel] = propValue;
      }
    }
    prod.brand = await pupHelper.getTxt('ul.breadcrumb > li:nth-last-child(2) span', page);
    prod.model = await pupHelper.getTxt('ul.breadcrumb > li:last-child span', page);
    
    products.push(prod);
    await page.close();
    resolve(true);
  } catch (error) {
    if (page) await page.close();
    console.log(`fetchProduct [${productLink}] Error: `, error.message);
    resolve(error);
  }
});

const fetchNewPhones = (feature) => new Promise(async (resolve, reject) => {
  try {
    console.log('Started Scraping...');

    // Launch the Browser
    browser = await pupHelper.launchBrowser();

    // Fetch Products Links for Brand
    console.log(`Fetching New Products Links...`);
    productsLinks = await fetchLinksNewPhone();
    productsLinks = _.uniq(productsLinks);
    console.log(`Number of New Products found: ${productsLinks.length}`);
    fs.writeFileSync('productsLinks.json', JSON.stringify(productsLinks));

    // Fetch Products Details for Brand
    console.log('Fetching Products Details...');
    const limit = pLimit(5);
    const promises = [];
    for (let i = 0; i < productsLinks.length; i++) {
      promises.push(limit(() => fetchProduct(productsLinks[i], i + 1, productsLinks.length)));
    }
    await Promise.all(promises);
    fs.writeFileSync('products.json', JSON.stringify(products));

    // Save Results to Csv
    console.log('Writing Csv...');
    await saveToCsv(feature);
    
    console.log('Finished Scraping...');
    await browser.close();
    resolve(true);
  } catch (error) {
    if (browser) await browser.close();
    console.log(`fetchNewPhones Error: ${error.message}`);
    reject(error);
  }
});

const fetchLinksNewPhone = () => new Promise(async (resolve, reject) => {
  let page;
  try {
    page = await pupHelper.launchPage(browser);
    await page.goto(newLink, {timeout: 0, waitUntil: 'load'});
    await page.waitForSelector('.two-items-bottom-items .owl-wrapper > .owl-item .pi-img-wrapper > a');
    const productsLinks = await pupHelper.getAttrMultiple('.two-items-bottom-items .owl-wrapper > .owl-item .pi-img-wrapper > a', 'href', page);

    await page.close();
    resolve(productsLinks);
  } catch (error) {
    if (page) await page.close();
    console.log(`fetchLinksNewPhone [${brandLink}] Error: `, error.message);
    reject(error);
  }
});

(async () => {
  const feature = process.argv[2];
  if (feature) {
    if (feature.toLowerCase() == 'new') {
      await fetchNewPhones(feature);
    } else if (feature.toLowerCase() == 'brand') {
      await fetchFromBrand(feature);
    } else {
      console.log('Please provide correct parameters with command "node bot new" or "node bot brand"');
    }
  } else {
    console.log('Please provide correct parameters with command "node bot new" or "node bot brand"');
  }
})()