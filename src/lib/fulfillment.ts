import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";
import { createEbookSignedUrl } from "./supabase.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Marks an order PAID/FULFILLED and generates signed download links for
 * any ebook items on it. Safe to call more than once for the same order —
 * it checks current status first so a webhook and a manual admin action
 * can never double-fulfill (and double-generate signed URLs for) the
 * same order.
 */
export async function fulfillOrder(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, items: { include: { book: true } } },
  });

  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.status === "FULFILLED") {
    return order; // already done — nothing more to do
  }

  const linksForEmail: { title: string; url: string }[] = [];

  for (const item of order.items) {
    if (item.book.format === "EBOOK" && item.book.ebookFileUrl) {
      // Skip if this item already has a live, unexpired link
      const alreadyValid =
        item.downloadToken && item.downloadExpires && item.downloadExpires > new Date();

      let downloadUrl = item.downloadToken;

      if (!alreadyValid) {
        const { signedUrl, expiresAt } = await createEbookSignedUrl(
          item.book.ebookFileUrl
        );
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { downloadToken: signedUrl, downloadExpires: expiresAt },
        });
        downloadUrl = signedUrl;
      }

      if (downloadUrl) {
        linksForEmail.push({ title: item.book.title, url: downloadUrl });
      }
    }
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "FULFILLED",
      paidAt: order.paidAt ?? new Date(),
      fulfilledAt: new Date(),
    },
    include: { customer: true, items: { include: { book: true } } },
  });

  if (linksForEmail.length > 0) {
    await sendFulfillmentEmail(
      updated.customer.email,
      updated.customer.fullName,
      linksForEmail
    );
  }

  return updated;
}

async function sendFulfillmentEmail(
  to: string,
  name: string,
  links: { title: string; url: string }[]
) {
  const linksHtml = links
    .map((l) => `<li><a href="${l.url}">${l.title}</a></li>`)
    .join("");

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `"NELBELL Bookstore" <no-reply@nelbell.com>`,
    to,
    subject: "Your order is ready — download your book(s)",
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for your order! Your ebook${links.length > 1 ? "s are" : " is"} ready:</p>
      <ul>${linksHtml}</ul>
      <p>Reach out if you have any issues downloading.</p>
    `,
  });
}