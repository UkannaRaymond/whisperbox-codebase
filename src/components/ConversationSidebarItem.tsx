import { NavLink } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export interface ConversationSidebarItemProps {
  /** Conversation id (used for routing, e.g. /chat/:id) */
  id: string;
  /** Display name of the other user / room */
  name: string;
  /** Number of unread messages for the current user */
  unreadCount?: number;
  /** Route to navigate to on click. Defaults to `/chat/${id}` */
  to?: string;
}

/**
 * A single conversation entry for the chat sidebar.
 *
 * When `unreadCount > 0`, renders a primary-colored badge on the right
 * to notify the receiver of new/unread messages. The row is also bolded.
 *
 * Drop this into your sidebar list, e.g.:
 *
 *   <SidebarMenu>
 *     {conversations.map((c) => (
 *       <ConversationSidebarItem
 *         key={c.id}
 *         id={c.id}
 *         name={c.name}
 *         unreadCount={c.unreadCount}
 *       />
 *     ))}
 *   </SidebarMenu>
 */
export function ConversationSidebarItem({
  id,
  name,
  unreadCount = 0,
  to,
}: ConversationSidebarItemProps) {
  const hasUnread = unreadCount > 0;
  const href = to ?? `/chat/${id}`;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={name}>
        <NavLink to={href} className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              "flex-1 truncate",
              hasUnread && "font-semibold text-foreground",
            )}
          >
            {name}
          </span>
          {hasUnread && (
            <Badge
              variant="default"
              className="ml-auto h-5 min-w-5 justify-center px-1.5 text-xs"
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export default ConversationSidebarItem;
