"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZATCASimplifiedTaxInvoice = exports.ZATCAPaymentMethods = exports.ZATCAInvoiceTypes = void 0;
const parser_1 = require("../parser");
const signing_1 = require("./signing");
const simplified_tax_invoice_template_1 = __importStar(require("./templates/simplified_tax_invoice_template"));
Object.defineProperty(exports, "ZATCAInvoiceTypes", { enumerable: true, get: function () { return simplified_tax_invoice_template_1.ZATCAInvoiceTypes; } });
Object.defineProperty(exports, "ZATCAPaymentMethods", { enumerable: true, get: function () { return simplified_tax_invoice_template_1.ZATCAPaymentMethods; } });
Number.prototype.toFixedNoRounding = function (n) {
    const reg = new RegExp("^-?\\d+(?:\\.\\d{0," + n + "})?", "g");
    let m = this.toString().match(reg);
    if (m?.length) {
        const a = m[0];
        const dot = a.indexOf(".");
        if (dot === -1) {
            return a + "." + "0".repeat(n);
        }
        const b = n - (a.length - dot) + 1;
        return b > 0 ? (a + "0".repeat(b)) : a;
    }
    return "0.00";
};
class ZATCASimplifiedTaxInvoice {
    invoice_xml;
    /**
     * Parses a ZATCA Simplified Tax Invoice XML string. Or creates a new one based on given props.
     * @param invoice_xml_str Invoice XML string to parse.
     * @param props ZATCASimplifiedInvoiceProps props to create a new unsigned invoice.
     */
    constructor({ invoice_xml_str, props }) {
        if (invoice_xml_str) {
            this.invoice_xml = new parser_1.XMLDocument(invoice_xml_str);
            if (!this.invoice_xml)
                throw new Error("Error parsing invoice XML string.");
        }
        else {
            if (!props)
                throw new Error("Unable to create new XML invoice.");
            this.invoice_xml = new parser_1.XMLDocument((0, simplified_tax_invoice_template_1.default)(props));
            // Parsing
            this.parseLineItems(props.line_items ?? [], props);
        }
    }
    constructLineItemTotals = (line_item) => {
        let line_item_total_discounts = 0;
        let line_item_total_taxes = 0;
        let cacAllowanceCharges = [];
        let cacClassifiedTaxCategories = [];
        let cacTaxTotal = {};
        // VAT
        // BR-KSA-DEC-02
        const VAT = {
            "cbc:ID": line_item.VAT_percent ? "S" : "O",
            // BT-120, KSA-121
            "cbc:Percent": line_item.VAT_percent ? (line_item.VAT_percent * 100).toFixedNoRounding(2) : undefined,
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
                    "#text": discount.amount.toFixedNoRounding(2)
                }
            });
        });
        // Calc item subtotal
        let line_item_subtotal = (line_item.tax_exclusive_price * line_item.quantity) - line_item_total_discounts;
        line_item_subtotal = parseFloat(line_item_subtotal.toFixedNoRounding(2));
        // Calc total taxes
        // BR-KSA-DEC-02
        line_item_total_taxes = parseFloat(line_item_total_taxes.toFixedNoRounding(2)) + parseFloat((line_item_subtotal * line_item.VAT_percent).toFixedNoRounding(2));
        line_item_total_taxes = parseFloat(line_item_total_taxes.toFixedNoRounding(2));
        line_item.other_taxes?.map((tax) => {
            line_item_total_taxes = parseFloat(line_item_total_taxes.toFixedNoRounding(2)) + parseFloat((tax.percent_amount * line_item_subtotal).toFixedNoRounding(2));
            line_item_total_taxes = parseFloat(line_item_total_taxes.toFixedNoRounding(2));
            cacClassifiedTaxCategories.push({
                "cbc:ID": "S",
                "cbc:Percent": (tax.percent_amount * 100).toFixedNoRounding(2),
                "cac:TaxScheme": {
                    "cbc:ID": "VAT"
                }
            });
        });
        // BR-KSA-DEC-03, BR-KSA-51
        cacTaxTotal = {
            "cbc:TaxAmount": {
                "@_currencyID": "SAR",
                "#text": line_item_total_taxes.toFixedNoRounding(2)
            },
            "cbc:RoundingAmount": {
                "@_currencyID": "SAR",
                "#text": (parseFloat(line_item_subtotal.toFixedNoRounding(2)) + parseFloat(line_item_total_taxes.toFixedNoRounding(2))).toFixed(2)
            }
        };
        return {
            cacAllowanceCharges,
            cacClassifiedTaxCategories, cacTaxTotal,
            line_item_total_tax_exclusive: line_item_subtotal,
            line_item_total_taxes,
            line_item_total_discounts
        };
    };
    constructLineItem = (line_item) => {
        const { cacAllowanceCharges, cacClassifiedTaxCategories, cacTaxTotal, line_item_total_tax_exclusive, line_item_total_taxes, line_item_total_discounts } = this.constructLineItemTotals(line_item);
        return {
            line_item_xml: {
                "cbc:ID": line_item.id,
                "cbc:InvoicedQuantity": {
                    "@_unitCode": "PCE",
                    "#text": line_item.quantity
                },
                // BR-DEC-23
                "cbc:LineExtensionAmount": {
                    "@_currencyID": "SAR",
                    "#text": line_item_total_tax_exclusive.toFixedNoRounding(2)
                },
                "cac:TaxTotal": cacTaxTotal,
                "cac:Item": {
                    "cbc:Name": line_item.name,
                    "cac:ClassifiedTaxCategory": cacClassifiedTaxCategories
                },
                "cac:Price": {
                    "cbc:PriceAmount": {
                        "@_currencyID": "SAR",
                        "#text": line_item.tax_exclusive_price
                    },
                    "cac:AllowanceCharge": cacAllowanceCharges
                }
            },
            line_item_totals: {
                taxes_total: line_item_total_taxes,
                discounts_total: line_item_total_discounts,
                subtotal: line_item_total_tax_exclusive
            }
        };
    };
    constructLegalMonetaryTotal = (tax_exclusive_subtotal, taxes_total) => {
        return {
            // BR-DEC-09
            "cbc:LineExtensionAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal.toFixedNoRounding(2)
            },
            // BR-DEC-12
            "cbc:TaxExclusiveAmount": {
                "@_currencyID": "SAR",
                "#text": tax_exclusive_subtotal.toFixedNoRounding(2)
            },
            // BR-DEC-14, BT-112
            "cbc:TaxInclusiveAmount": {
                "@_currencyID": "SAR",
                "#text": (parseFloat((tax_exclusive_subtotal + taxes_total).toFixed(2)))
            },
            "cbc:AllowanceTotalAmount": {
                "@_currencyID": "SAR",
                "#text": 0
            },
            "cbc:PrepaidAmount": {
                "@_currencyID": "SAR",
                "#text": 0
            },
            // BR-DEC-18, BT-112
            "cbc:PayableAmount": {
                "@_currencyID": "SAR",
                "#text": (parseFloat((tax_exclusive_subtotal + taxes_total).toFixed(2)))
            }
        };
    };
    constructTaxTotal = (line_items) => {
        const cacTaxSubtotal = [];
        // BR-DEC-13, MESSAGE : [BR-DEC-13]-The allowed maximum number of decimals for the Invoice total VAT amount (BT-110) is 2.
        const addTaxSubtotal = (taxable_amount, tax_amount, tax_percent) => {
            cacTaxSubtotal.push({
                // BR-DEC-19
                "cbc:TaxableAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxable_amount.toFixedNoRounding(2)
                },
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": tax_amount.toFixedNoRounding(2)
                },
                "cac:TaxCategory": {
                    "cbc:ID": {
                        "@_schemeAgencyID": 6,
                        "@_schemeID": "UN/ECE 5305",
                        "#text": tax_percent ? "S" : "O"
                    },
                    "cbc:Percent": (tax_percent * 100).toFixedNoRounding(2),
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
        };
        let taxes_total = 0;
        let taxable_amount_total = 0;
        line_items.map((line_item) => {
            const total_line_item_discount = line_item.discounts?.reduce((p, c) => p + c.amount, 0);
            const taxable_amount = (line_item.tax_exclusive_price * line_item.quantity) - (total_line_item_discount ?? 0);
            let tax_amount = line_item.VAT_percent * taxable_amount;
            //addTaxSubtotal(taxable_amount, tax_amount, line_item.VAT_percent);
            taxes_total += parseFloat(tax_amount.toFixedNoRounding(2));
            line_item.other_taxes?.map((tax) => {
                tax_amount = tax.percent_amount * taxable_amount;
                //addTaxSubtotal(taxable_amount, tax_amount, tax.percent_amount);
                taxes_total += parseFloat(tax_amount.toFixedNoRounding(2));
            });
            taxable_amount_total += parseFloat(taxable_amount.toFixedNoRounding(2));
        });
        addTaxSubtotal(taxable_amount_total, taxes_total, line_items[0].VAT_percent);
        // BT-110
        taxes_total = parseFloat(taxes_total.toFixed(2));
        // BR-DEC-13, MESSAGE : [BR-DEC-13]-The allowed maximum number of decimals for the Invoice total VAT amount (BT-110) is 2.
        return [
            {
                // Total tax amount for the full invoice
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxes_total.toFixedNoRounding(2)
                },
                "cac:TaxSubtotal": cacTaxSubtotal,
            },
            {
                // KSA Rule for VAT tax
                "cbc:TaxAmount": {
                    "@_currencyID": "SAR",
                    "#text": taxes_total.toFixedNoRounding(2)
                }
            }
        ];
    };
    parseLineItems(line_items, props) {
        let total_taxes = 0;
        let total_subtotal = 0;
        let invoice_line_items = [];
        line_items.map((line_item) => {
            const { line_item_xml, line_item_totals } = this.constructLineItem(line_item);
            total_taxes += parseFloat(line_item_totals.taxes_total.toFixedNoRounding(2));
            total_subtotal += parseFloat(line_item_totals.subtotal.toFixedNoRounding(2));
            invoice_line_items.push(line_item_xml);
        });
        // BT-110
        total_taxes = parseFloat(total_taxes.toFixed(2));
        total_subtotal = parseFloat(total_subtotal.toFixed(2));
        if (props.cancelation) {
            // Invoice canceled. Tunred into credit/debit note. Must have PaymentMeans
            // BR-KSA-17
            this.invoice_xml.set("Invoice/cac:PaymentMeans", false, {
                "cbc:PaymentMeansCode": props.cancelation.payment_method,
                "cbc:InstructionNote": props.cancelation.reason ?? "No note Specified"
            });
        }
        this.invoice_xml.set("Invoice/cac:TaxTotal", false, this.constructTaxTotal(line_items));
        this.invoice_xml.set("Invoice/cac:LegalMonetaryTotal", true, this.constructLegalMonetaryTotal(total_subtotal, total_taxes));
        invoice_line_items.map((line_item) => {
            this.invoice_xml.set("Invoice/cac:InvoiceLine", false, line_item);
        });
    }
    getXML() {
        return this.invoice_xml;
    }
    /**
     * Signs the invoice.
     * @param certificate_string String signed EC certificate.
     * @param private_key_string String ec-secp256k1 private key;
     * @returns String signed invoice xml, includes QR generation.
     */
    sign(certificate_string, private_key_string) {
        return (0, signing_1.generateSignedXMLString)({
            invoice_xml: this.invoice_xml,
            certificate_string: certificate_string,
            private_key_string: private_key_string
        });
    }
}
exports.ZATCASimplifiedTaxInvoice = ZATCASimplifiedTaxInvoice;
