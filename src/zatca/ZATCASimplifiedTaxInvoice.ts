import { XMLDocument } from "../parser";
import { generateSignedXMLString } from "./signing";
import defaultSimplifiedTaxInvoice, { ZATCASimplifiedInvoiceLineItem, ZATCASimplifiedInvoiceProps } from "./templates/simplified_tax_invoice_template";

export class ZATCASimplifiedTaxInvoice {

    private invoice_xml: XMLDocument;

    /**
     * Parses a ZATCA Simplified Tax Invoice XML string. Or creates a new one based on given props.
     * @param invoice_xml_str Invoice XML string to parse.
     * @param props ZATCASimplifiedInvoiceProps props to create a new unsigned invoice.
     */
    constructor({invoice_xml_str, props}: {invoice_xml_str?: string, props?: ZATCASimplifiedInvoiceProps}) {

        if (invoice_xml_str) {
            this.invoice_xml = new XMLDocument(invoice_xml_str);
            if (!this.invoice_xml) throw new Error("Error parsing invoice XML string.");
        } else {
            if (!props) throw new Error("Unable to create new XML invoice.");
            this.invoice_xml = new XMLDocument(defaultSimplifiedTaxInvoice(props));

            // Parsing
            this.parseLineItems(props.line_items ?? [], props);

        }

    }

    private constructLineItemTotals = (line_item: ZATCASimplifiedInvoiceLineItem) => {
        
        // TODO: decimal fixing according to ZATCA

        let line_item_total_discounts = 0;
        let line_item_total_taxes = 0;

        let cacAllowanceCharges: any[] = [];

        let cacClassifiedTaxCategories: any[] = [];
        let cacTaxTotal = {};

        // VAT
        // BR-KSA-DEC-02
        const VAT = {
            "cbc:ID": line_item.VAT_percent ? "S" : "O",
            // BT-120, KSA-121
            "cbc:Percent": line_item.VAT_percent ? (line_item.VAT_percent * 100).toFixed(2) : undefined,
            "cac:TaxScheme": {
                "cbc:ID": "VAT"
            }
        };
        cacClassifiedTaxCategories.push(VAT);
        
        // Calc total discounts
        line_item.discounts?.map((discount) => {
            line_item_total_discounts += discount.amount;
            cacAllowanceCharges.push({
                "cbc:ChargeIndicator": "false",
                "cbc:AllowanceChargeReason": discount.reason,
                "cbc:Amount": {
                    "@_currencyID": "SAR",
                    // BR-DEC-01
                    "#text": discount.amount.toFixed(2)
                }
            });
        });

         
        // Calc item subtotal
        const line_item_subtotal = 
            (line_item.tax_exclusive_price * line_item.quantity) - line_item_total_discounts;


        // Calc total taxes
        // BR-KSA-DEC-02
        line_item_total_taxes += line_item_subtotal * line_item.VAT_percent;
        line_item.other_taxes?.map((tax) => {
            line_item_total_taxes += tax.percent_amount * line_item_subtotal;
            cacClassifiedTaxCategories.push({
                "cbc:ID": "S",
                "cbc:Percent": (tax.percent_amount * 100).toFixed(2),
                "cac:TaxScheme": {
                    "cbc:ID": "VAT"
                }        
            })
        });

        // BR-KSA-DEC-03
        cacTaxTotal = {
            "cbc:TaxAmount": {
                "@_currencyID": "SAR",
                "#text": line_item_total_taxes.toFixed(2)
            },
            "cbc:RoundingAmount": {
                "@_currencyID": "SAR",
                "#text":  (line_item_subtotal + line_item_total_taxes).toFixed(2)
            }
        };


        return {
            cacAllowanceCharges, 
            cacClassifiedTaxCategories, cacTaxTotal,
            line_item_total_tax_exclusive: line_item_subtotal,
            line_item_total_taxes,
            line_item_total_discounts
        }
    }


    private constructLineItem = (line_item: ZATCASimplifiedInvoiceLineItem) => {
        
        const {
            cacAllowanceCharges,
            cacClassifiedTaxCategories, cacTaxTotal,
            line_item_total_tax_exclusive,
            line_item_total_taxes,
            line_item_total_discounts
        } = this.constructLineItemTotals(line_item);

        return {
                line_item_xml: {
                    //  .. TODO
                    "cbc:ID": line_item.id,
                    //  .. TODO
                    "cbc:InvoicedQuantity": {
                        "@_unitCode": "PCE",
                        "#text": line_item.quantity
                    },
                    //  .. TODO
                    "cbc:LineExtensionAmount": {
                        "@_currencyID": "SAR",
                        "#text": line_item_total_tax_exclusive
                    },
                    //  .. TODO
                    "cac:TaxTotal": cacTaxTotal,
                    //  .. TODO
                    "cac:Item": {
                        "cbc:Name": line_item.name,
                        "cac:ClassifiedTaxCategory": cacClassifiedTaxCategories
                    },
                    //  .. TODO
                    "cac:Price": {
                        "cbc:PriceAmount": {
                            "@_currencyID": "SAR",
                            "#text": line_item.tax_exclusive_price
                        },
                        //  .. TODO
                        "cac:AllowanceCharge": cacAllowanceCharges
                    }
                },
                line_item_totals: {
                    taxes_total: line_item_total_taxes,
                    discounts_total: line_item_total_discounts,
                    subtotal: line_item_total_tax_exclusive
                }
            };
    }


    private constructLegalMonetaryTotal = (tax_exclusive_subtotal: number, taxes_total: number) => {

        // TODO: amount decimals according to ZATCA
        return {
            "cbc:LineExtensionAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal
            },
            "cbc:TaxExclusiveAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal
            },
            "cbc:TaxInclusiveAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal + taxes_total
            },
            "cbc:AllowanceTotalAmount": {
                "@_currencyID": "SAR",
                "#text": 0
            },
            "cbc:PrepaidAmount": {
                "@_currencyID": "SAR",
                "#text": 0
            },
            "cbc:PayableAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal + taxes_total
            }
        }
    }

    private constructTaxTotal = (line_items: ZATCASimplifiedInvoiceLineItem[]) => {

        const cacTaxSubtotal: any[] = [];
        // BR-DEC-13, MESSAGE : [BR-DEC-13]-The allowed maximum number of decimals for the Invoice total VAT amount (BT-110) is 2.
        const addTaxSubtotal = (taxable_amount: number, tax_amount: number, tax_percent: number) => {
            cacTaxSubtotal.push({
                "cbc:TaxableAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxable_amount
                },
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": tax_amount.toFixed(2)
                },
                "cac:TaxCategory": {
                    "cbc:ID": {
                        "@_schemeAgencyID": 6,
                        "@_schemeID": "UN/ECE 5305",
                        "#text": tax_percent ? "S" : "O"
                    },
                    "cbc:Percent": (tax_percent * 100).toFixed(2),
                    // BR-O-10
                    "cbc:TaxExemptionReason": tax_percent ? undefined : "Not subject to VAT",
                    "cac:TaxScheme": {
                        "cbc:ID": {
                            "@_schemeAgencyID": "6",
                            "@_schemeID": "UN/ECE 5153",
                            "#text": "VAT"
                        }
                    },
                }
            });
        }
        
        let taxes_total = 0;
        line_items.map((line_item) => {
            const total_line_item_discount = line_item.discounts?.reduce((p, c) => p+c.amount, 0);
            const taxable_amount = (line_item.tax_exclusive_price * line_item.quantity) - (total_line_item_discount ?? 0);

            let tax_amount = line_item.VAT_percent * taxable_amount;
            addTaxSubtotal(taxable_amount, tax_amount, line_item.VAT_percent);
            taxes_total += tax_amount;
            line_item.other_taxes?.map((tax) => {
                tax_amount = tax.percent_amount * taxable_amount;
                addTaxSubtotal(taxable_amount, tax_amount, tax.percent_amount);
                taxes_total += tax_amount;
            });
        });

        // BR-DEC-13, MESSAGE : [BR-DEC-13]-The allowed maximum number of decimals for the Invoice total VAT amount (BT-110) is 2.
        return [
            {
                // Total tax amount for the full invoice
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxes_total.toFixed(2)
                },
                "cac:TaxSubtotal": cacTaxSubtotal,
            },
            {
                // KSA Rule for VAT tax
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxes_total.toFixed(2)
                }
            }
        ];
    }

    private parseLineItems(line_items: ZATCASimplifiedInvoiceLineItem[], props: ZATCASimplifiedInvoiceProps) {
        
        let total_taxes: number = 0;
        let total_subtotal: number = 0;

        let invoice_line_items: any[] = [];
        line_items.map((line_item) => {
            
            const {line_item_xml, line_item_totals} = this.constructLineItem(line_item);
            total_taxes += line_item_totals.taxes_total;
            total_subtotal += line_item_totals.subtotal;

            invoice_line_items.push(line_item_xml);          
        });
        

        if(props.cancelation) {
            // Invoice canceled. Make it a credit/debit note
            // BR-KSA-17
            this.invoice_xml.set("Invoice/cac:PaymentMeans", false, {
                "cbc:PaymentMeansCode": props.cancelation.payment_method,
                "cbc:InstructionNote": props.cancelation.reason ?? "No note Specified"
            });
        }
        
        this.invoice_xml.set("Invoice/cac:TaxTotal", false, this.constructTaxTotal(line_items));

        this.invoice_xml.set("Invoice/cac:LegalMonetaryTotal", true, this.constructLegalMonetaryTotal(
            total_subtotal,
            total_taxes
        ));

        invoice_line_items.map((line_item) => {
            this.invoice_xml.set("Invoice/cac:InvoiceLine", false, line_item);  
        });
        
    }

    getXML(): XMLDocument {
        return this.invoice_xml;
    }

    /**
     * Signs the invoice.
     * @param certificate_string String signed EC certificate.
     * @param private_key_string String ec-secp256k1 private key;
     * @returns String signed invoice xml, includes QR generation.
     */
    sign(certificate_string: string, private_key_string: string) {
        return generateSignedXMLString({
            invoice_xml: this.invoice_xml,
            certificate_string: certificate_string,
            private_key_string: private_key_string
        });
    }

}

