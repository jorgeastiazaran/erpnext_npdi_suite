import frappe

def run():
    """Backfill subject field in Task Depends On rows where it is empty."""
    rows = frappe.db.sql("""
        SELECT name, task
        FROM `tabTask Depends On`
        WHERE (subject IS NULL OR subject = '')
          AND task IS NOT NULL AND task != ''
    """, as_dict=True)

    print(f"Found {len(rows)} rows to backfill...")
    updated = 0
    batch = []
    for row in rows:
        subject = frappe.db.get_value('Task', row.task, 'subject')
        if subject:
            batch.append((subject, row.name))
            updated += 1

    # Bulk update
    if batch:
        for subject, name in batch:
            frappe.db.sql("""
                UPDATE `tabTask Depends On`
                SET subject = %s
                WHERE name = %s
            """, (subject, name))
        frappe.db.commit()

    print(f"Backfilled {updated} rows.")
