import { prisma } from "./prisma.js";
import { createEbookSignedUrl } from "./supabase.js";

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
    include: { items: { include: { book: true } } },
  });

  if (!order) throw new Error(`Order ${orderId} not found`);

  if (order.status === "FULFILLED") {
    return order; // already done — nothing more to do
  }

  for (const item of order.items) {
    if (item.book.format === "EBOOK" && item.book.ebookFileUrl) {
      // Skip if this item already has a live, unexpired link
      const alreadyValid =
        item.downloadToken && item.downloadExpires && item.downloadExpires > new Date();

      if (!alreadyValid) {
        const { signedUrl, expiresAt } = await createEbookSignedUrl(
          item.book.ebookFileUrl
        );
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { downloadToken: signedUrl, downloadExpires: expiresAt },
        });
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
    include: { items: { include: { book: true } } },
  });

  return updated;
}
